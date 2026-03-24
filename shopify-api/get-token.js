/**
 * get-token.js — Obtiene el Access Token de Shopify en 2 pasos
 *
 * PASO 1: node get-token.js
 *         → Te da una URL. Ábrela en el navegador y autoriza la app.
 *         → Shopify te redirigirá a localhost (dará error de conexión — es normal)
 *         → Copia la URL completa de la barra del navegador
 *
 * PASO 2: node get-token.js "URL_QUE_COPIASTE"
 *         → Te da el ACCESS TOKEN
 */

require('dotenv').config();
const crypto = require('crypto');
const https  = require('https');

const CLIENT_ID     = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOP          = 'gradi-handmade.myshopify.com';
const REDIRECT_URI  = 'http://localhost:3000/auth/callback';
const SCOPES        = 'read_products,write_products,read_orders,write_orders,read_customers';

// ── PASO 1: Sin argumentos → imprime la URL de autorización ─────────────────
if (process.argv.length < 3) {
  const nonce = crypto.randomBytes(16).toString('hex');

  const url = new URL(`https://${SHOP}/admin/oauth/authorize`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', nonce);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  PASO 1 — Abre esta URL en tu navegador:');
  console.log('══════════════════════════════════════════════════════\n');
  console.log(url.toString());
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Después de autorizar, copia la URL del navegador');
  console.log('  (aunque diga "No se puede acceder" — es normal)');
  console.log('  y ejecuta:');
  console.log('\n  node get-token.js "URL_COMPLETA_QUE_COPIASTE"\n');
  console.log('══════════════════════════════════════════════════════\n');

  console.log(`  STATE/NONCE: ${nonce}  (guárdalo por si acaso)\n`);
  process.exit(0);
}

// ── PASO 2: Con la URL del callback → extraer código y obtener token ─────────
const callbackUrl = process.argv[2];
const params = new URL(callbackUrl).searchParams;

const code      = params.get('code');
const hmac      = params.get('hmac');
const shop      = params.get('shop');
const state     = params.get('state');
const timestamp = params.get('timestamp');
const host      = params.get('host');

if (!code) {
  console.error('\n❌ No se encontró el parámetro "code" en la URL.\n');
  process.exit(1);
}

// Verificar HMAC (Step 3 de la doc)
const queryObj = { code, shop, state, timestamp };
if (host) queryObj.host = host;

const message = Object.keys(queryObj)
  .sort()
  .map(k => `${k}=${queryObj[k]}`)
  .join('&');

const digest = crypto
  .createHmac('sha256', CLIENT_SECRET)
  .update(message)
  .digest('hex');

const hmacValid = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));

if (!hmacValid) {
  console.error('\n❌ HMAC inválido — la URL no es auténtica de Shopify.\n');
  process.exit(1);
}

// Validar shop
if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
  console.error('\n❌ Shop inválido.\n');
  process.exit(1);
}

console.log('\n✅ HMAC verificado. Intercambiando código por token...\n');

// Step 4: POST /admin/oauth/access_token
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

const req = https.request(options, res => {
  let raw = '';
  res.on('data', chunk => (raw += chunk));
  res.on('end', () => {
    const data = JSON.parse(raw);

    if (!data.access_token) {
      console.error('❌ Error de Shopify:', raw);
      process.exit(1);
    }

    console.log('══════════════════════════════════════════════════════');
    console.log('  ✅ ACCESS TOKEN OBTENIDO');
    console.log('══════════════════════════════════════════════════════\n');
    console.log(`  TOKEN : ${data.access_token}`);
    console.log(`  SCOPES: ${data.scope}`);
    console.log('\n  Copia este token y ponlo en tu .env como:');
    console.log('  SHOPIFY_ADMIN_TOKEN=' + data.access_token);
    console.log('\n══════════════════════════════════════════════════════\n');
  });
});

req.on('error', err => {
  console.error('❌ Error de red:', err.message);
});

req.write(body);
req.end();
