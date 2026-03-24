/**
 * Shopify OAuth - Authorization Code Grant (manual, sin librería Shopify)
 * Gradi Handmade — 2026
 *
 * SETUP:
 * 1. Instala ngrok: https://ngrok.com/download
 * 2. Ejecuta: ngrok http 3000  → copia la URL https://xxxx.ngrok.io
 * 3. En tu .env pon esa URL como APP_URL
 * 4. En Dev Dashboard de Shopify → tu app → URLs:
 *    - App URL: https://xxxx.ngrok.io/
 *    - Allowed redirect URLs: https://xxxx.ngrok.io/auth/callback
 * 5. npm start
 * 6. Visita: https://xxxx.ngrok.io/?shop=gradi-handmade.myshopify.com
 */

require('dotenv').config();
const express      = require('express');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const https        = require('https');
const qs           = require('querystring');

const app = express();
app.use(cookieParser(process.env.COOKIE_SECRET || 'gradi-secret-key'));

const {
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  APP_URL,          // ej: https://xxxx.ngrok.io
  SHOPIFY_SCOPES,   // ej: read_products,write_products,read_orders
} = process.env;

const VERSION       = '2026-01';
const REDIRECT_PATH = '/auth/callback';
const REDIRECT_URI  = `${APP_URL}${REDIRECT_PATH}`;

// ── Token store en memoria (en producción usa una DB) ────────────────────────
const tokenStore = {}; // { 'shop.myshopify.com': 'token' }

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Verifica el HMAC que manda Shopify en cualquier request */
function verifyHMAC(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  // Ordena los parámetros alfabéticamente y construye el mensaje
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest('hex');

  // Comparación segura contra timing attacks
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

/** Valida que el shop tenga formato válido de Shopify */
function validShop(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop);
}

/** Genera un nonce aleatorio para proteger contra CSRF */
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/** Hace una petición HTTPS y devuelve una Promise con el JSON */
function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = qs.stringify(data);
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error: ' + raw)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Rutas ────────────────────────────────────────────────────────────────────

/**
 * PASO 1: Punto de entrada — Shopify llama aquí cuando el merchant instala la app.
 * También sirve para iniciar el flujo manualmente con ?shop=...
 *
 * GET /?shop=gradi-handmade.myshopify.com
 */
app.get('/', (req, res) => {
  const { shop, hmac, timestamp } = req.query;

  if (!shop) {
    return res.status(400).send(`
      <h2>Gradi Handmade — Shopify OAuth</h2>
      <p>Usa: <code>/?shop=gradi-handmade.myshopify.com</code></p>
    `);
  }

  // Validar shop
  if (!validShop(shop)) {
    return res.status(400).send('Invalid shop parameter.');
  }

  // Si viene hmac del request de instalación, verificarlo (Step 1)
  if (hmac && !verifyHMAC(req.query)) {
    return res.status(403).send('HMAC verification failed.');
  }

  // Si ya tenemos token para esta tienda, ir directo a la app
  if (tokenStore[shop]) {
    return res.redirect(`/app?shop=${shop}`);
  }

  // PASO 2: Redirigir al flujo de autorización
  res.redirect(`/auth?shop=${shop}`);
});

/**
 * PASO 2: Construye la URL de autorización y redirige a Shopify.
 *
 * GET /auth?shop=gradi-handmade.myshopify.com
 */
app.get('/auth', (req, res) => {
  const { shop } = req.query;

  if (!shop || !validShop(shop)) {
    return res.status(400).send('Missing or invalid shop parameter.');
  }

  // Genera nonce y lo guarda en una cookie firmada (protección CSRF)
  const nonce = generateNonce();
  res.cookie('shopify_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 10 * 60 * 1000, // 10 minutos
    signed: true,
  });

  // Construye la URL de autorización de Shopify
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', SHOPIFY_CLIENT_ID);
  authUrl.searchParams.set('scope', SHOPIFY_SCOPES || 'read_products,write_products,read_orders,write_orders');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', nonce);
  // Para token offline (permanente), omite grant_options[].
  // Para token online (por usuario): authUrl.searchParams.set('grant_options[]', 'per-user');

  console.log(`[OAuth] Redirigiendo a Shopify para ${shop}`);
  res.redirect(authUrl.toString());
});

/**
 * PASO 3 + 4: Shopify redirige aquí con el código de autorización.
 *
 * GET /auth/callback?code=...&hmac=...&shop=...&state=...&timestamp=...
 */
app.get('/auth/callback', async (req, res) => {
  const { code, hmac, shop, state, timestamp, host } = req.query;

  // ── Seguridad: validaciones requeridas ──────────────────────────────────

  // 1. Validar shop
  if (!shop || !validShop(shop)) {
    return res.status(400).send('Invalid shop.');
  }

  // 2. Verificar HMAC (Step 3)
  if (!verifyHMAC(req.query)) {
    return res.status(403).send('HMAC verification failed.');
  }

  // 3. Verificar nonce/state contra la cookie (protección CSRF)
  const savedNonce = req.signedCookies['shopify_oauth_state'];
  if (!savedNonce || savedNonce !== state) {
    return res.status(403).send('State/nonce mismatch. Possible CSRF attack.');
  }

  // 4. Limpiar la cookie del nonce — ya no la necesitamos
  res.clearCookie('shopify_oauth_state');

  // ── Paso 4: Intercambiar el código por un access token ──────────────────
  try {
    const tokenResponse = await httpsPost(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id:     SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }
    );

    if (!tokenResponse.access_token) {
      console.error('[OAuth] Respuesta inesperada:', tokenResponse);
      return res.status(500).send('No se pudo obtener el access token.');
    }

    const { access_token, scope } = tokenResponse;

    // Confirmar que los scopes solicitados fueron concedidos
    const requested = (SHOPIFY_SCOPES || '').split(',').map(s => s.trim());
    const granted   = scope.split(',').map(s => s.trim());
    const missing   = requested.filter(s => !granted.includes(s));

    if (missing.length > 0) {
      console.warn(`[OAuth] Scopes faltantes: ${missing.join(', ')}`);
    }

    // Guardar token (en producción: base de datos)
    tokenStore[shop] = access_token;

    console.log(`[OAuth] ✅ Token obtenido para ${shop}`);
    console.log(`[OAuth] Scopes: ${scope}`);

    // Paso 5: Redirigir a la UI de la app
    res.redirect(`/app?shop=${shop}`);

  } catch (err) {
    console.error('[OAuth] Error al obtener token:', err.message);
    res.status(500).send('Error al obtener el access token: ' + err.message);
  }
});

/**
 * PASO 6: UI de la app — ya autenticada, hace llamadas a la API de Shopify.
 *
 * GET /app?shop=gradi-handmade.myshopify.com
 */
app.get('/app', async (req, res) => {
  const { shop } = req.query;

  const token = tokenStore[shop];
  if (!token) {
    // No tenemos token → iniciar OAuth de nuevo
    return res.redirect(`/auth?shop=${shop}`);
  }

  try {
    // Llamada autenticada a la Admin API (REST)
    const apiRes = await fetch(
      `https://${shop}/admin/api/${VERSION}/shop.json`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (!apiRes.ok) {
      if (apiRes.status === 401) {
        // Token inválido o revocado → volver a autenticar
        delete tokenStore[shop];
        return res.redirect(`/auth?shop=${shop}`);
      }
      throw new Error(`API error: ${apiRes.status}`);
    }

    const { shop: shopData } = await apiRes.json();

    // También obtener productos
    const prodRes = await fetch(
      `https://${shop}/admin/api/${VERSION}/products.json?limit=5`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const { products } = await prodRes.json();

    // Responde con HTML simple (en producción: React/Polaris)
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Gradi Handmade — App</title>
        <style>
          body { font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; }
          h1 { color: #2c6e49; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
          th { background: #f0f0f0; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; background: #d4edda; color: #155724; }
        </style>
      </head>
      <body>
        <h1>🌿 Gradi Handmade</h1>
        <p><strong>Tienda:</strong> ${shopData.name}</p>
        <p><strong>Email:</strong> ${shopData.email}</p>
        <p><strong>Plan:</strong> <span class="badge">${shopData.plan_name}</span></p>
        <p><strong>Moneda:</strong> ${shopData.currency}</p>

        <h2>Productos recientes</h2>
        <table>
          <tr><th>Nombre</th><th>Estado</th><th>Precio</th></tr>
          ${products.map(p => `
            <tr>
              <td>${p.title}</td>
              <td>${p.status}</td>
              <td>$${p.variants[0]?.price || '–'}</td>
            </tr>
          `).join('')}
        </table>

        <p style="margin-top:32px; color:#888; font-size:13px;">
          OAuth completado ✓ | Token almacenado en memoria<br>
          Shop: ${shop}
        </p>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('[App] Error:', err.message);
    res.status(500).send('Error al conectar con Shopify: ' + err.message);
  }
});

// ── Arrancar servidor ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌿 Gradi Handmade — Shopify OAuth Server`);
  console.log(`   Puerto  : http://localhost:${PORT}`);
  console.log(`   App URL : ${APP_URL || '⚠️  APP_URL no configurado en .env'}`);
  console.log(`   Callback: ${REDIRECT_URI}`);
  console.log(`\n   Inicia el flujo: ${APP_URL || 'http://localhost:' + PORT}/?shop=gradi-handmade.myshopify.com\n`);
});
