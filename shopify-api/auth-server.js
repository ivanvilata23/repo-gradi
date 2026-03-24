/**
 * auth-server.js — Servidor OAuth para obtener el Access Token de Shopify
 *
 * INSTRUCCIONES:
 *  1. En una terminal:  node auth-server.js
 *  2. En otra terminal: ngrok http 3000
 *     → Copia la URL pública de ngrok (ej: https://xxxx.ngrok-free.app)
 *  3. En Shopify Partners Dashboard → tu app → URLs:
 *     Allowed redirect URL: https://xxxx.ngrok-free.app/auth/callback
 *  4. Abre en el navegador: http://localhost:3000/auth/start
 *  5. Autoriza la app → el token aparece en la pantalla y en la terminal
 */

require('dotenv').config();
const http    = require('http');
const https   = require('https');
const crypto  = require('crypto');
const url     = require('url');

const CLIENT_ID     = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOP          = 'gradi-handmade.myshopify.com';
const PORT          = 3000;
const SCOPES        = 'read_products,write_products,read_orders,write_orders,read_customers';

// Estado en memoria (solo para esta sesión)
let NGROK_URL = process.env.NGROK_URL || '';
let pendingState = null;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const path   = parsed.pathname;
  const query  = parsed.query;

  // ── GET /set-ngrok?url=https://xxxx.ngrok-free.app ────────────────────────
  if (path === '/set-ngrok') {
    NGROK_URL = (query.url || '').replace(/\/$/, '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html('URL de ngrok guardada', `
      <p>URL configurada: <strong>${NGROK_URL}</strong></p>
      <p><a href="/auth/start">→ Iniciar autorización con Shopify</a></p>
    `));
    return;
  }

  // ── GET /auth/start ───────────────────────────────────────────────────────
  if (path === '/auth/start') {
    if (!NGROK_URL) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('Falta la URL de ngrok', `
        <p>Primero configura tu URL de ngrok:</p>
        <form action="/set-ngrok" method="get">
          <input name="url" placeholder="https://xxxx.ngrok-free.app" size="50">
          <button type="submit">Guardar</button>
        </form>
      `));
      return;
    }

    pendingState = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${NGROK_URL}/auth/callback`;

    const authUrl = new URL(`https://${SHOP}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', pendingState);

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // ── GET /auth/callback ────────────────────────────────────────────────────
  if (path === '/auth/callback') {
    const { code, hmac, shop, state, timestamp, host } = query;

    // Validar state
    if (state !== pendingState) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('Error', '<p>State inválido. Posible ataque CSRF.</p>'));
      return;
    }

    // Validar shop
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('Error', '<p>Shop inválido.</p>'));
      return;
    }

    // Verificar HMAC
    const queryObj = { code, shop, state, timestamp };
    if (host) queryObj.host = host;

    const message = Object.keys(queryObj).sort().map(k => `${k}=${queryObj[k]}`).join('&');
    const digest  = crypto.createHmac('sha256', CLIENT_SECRET).update(message).digest('hex');
    const valid   = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));

    if (!valid) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('Error', '<p>HMAC inválido.</p>'));
      return;
    }

    // Intercambiar código por token
    const redirectUri = `${NGROK_URL}/auth/callback`;
    const body = `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}`;

    const options = {
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept':         'application/json',
      },
    };

    const apiReq = https.request(options, apiRes => {
      let raw = '';
      apiRes.on('data', chunk => (raw += chunk));
      apiRes.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch (e) {
          res.writeHead(500);
          res.end(html('Error', `<pre>${raw}</pre>`));
          return;
        }

        if (!data.access_token) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html('Error de Shopify', `<pre>${JSON.stringify(data, null, 2)}</pre>`));
          return;
        }

        // Éxito
        console.log('\n══════════════════════════════════════════════');
        console.log('  ✅ ACCESS TOKEN OBTENIDO');
        console.log('══════════════════════════════════════════════');
        console.log(`  TOKEN : ${data.access_token}`);
        console.log(`  SCOPES: ${data.scope}`);
        console.log('══════════════════════════════════════════════\n');
        console.log('  Añade esto a tu .env:');
        console.log(`  SHOPIFY_ADMIN_TOKEN=${data.access_token}\n`);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html('✅ TOKEN OBTENIDO', `
          <div style="background:#1a1a2e;color:#00ff88;padding:20px;border-radius:8px;font-family:monospace">
            <p><strong>ACCESS TOKEN:</strong></p>
            <p style="font-size:1.1em;word-break:break-all">${data.access_token}</p>
            <hr style="border-color:#333">
            <p><strong>SCOPES:</strong> ${data.scope}</p>
          </div>
          <p style="margin-top:20px">Copia el token y ponlo en tu <code>.env</code> como:<br>
          <code>SHOPIFY_ADMIN_TOKEN=${data.access_token}</code></p>
          <p>Ya puedes cerrar el servidor (Ctrl+C).</p>
        `));
      });
    });

    apiReq.on('error', err => {
      res.writeHead(500);
      res.end(html('Error de red', `<pre>${err.message}</pre>`));
    });

    apiReq.write(body);
    apiReq.end();
    return;
  }

  // ── Raíz ──────────────────────────────────────────────────────────────────
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html('Gradi Shopify Auth', `
    <p>Servidor de autenticación Shopify activo.</p>
    <form action="/set-ngrok" method="get">
      <p>Introduce tu URL de ngrok (ej: https://xxxx.ngrok-free.app):</p>
      <input name="url" placeholder="https://xxxx.ngrok-free.app" size="50">
      <button type="submit">Guardar y continuar</button>
    </form>
  `));
});

server.listen(PORT, () => {
  console.log(`\n  Servidor OAuth en http://localhost:${PORT}`);
  console.log(`  Abre http://localhost:${PORT} en tu navegador\n`);
});

function html(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${title}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:700px;margin:60px auto;padding:0 20px}
  h1{color:#1a1a2e}code{background:#f0f0f0;padding:2px 6px;border-radius:3px}</style>
  </head><body><h1>${title}</h1>${body}</body></html>`;
}
