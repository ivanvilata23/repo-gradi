/**
 * Shopify API 2026 - Setup para Gradi Handmade
 *
 * Flujo OAuth:
 * 1. Registra tu app en Shopify Partners → obtienes CLIENT_ID y CLIENT_SECRET
 * 2. Copia .env.example → .env y llena las variables
 * 3. Ejecuta: npm install && npm start
 * 4. Ve a: http://localhost:3000/auth?shop=tu-tienda.myshopify.com
 */

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { shopifyApi, ApiVersion, Session } = require('@shopify/shopify-api');
const { restResources } = require('@shopify/shopify-api/rest/admin/2026-01');

const app = express();
app.use(cookieParser());
app.use(express.json());

// ── Inicializar Shopify API 2026-01 ──────────────────────────────────────────
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SHOPIFY_SCOPES.split(','),
  hostName: process.env.SHOPIFY_APP_URL.replace(/https?:\/\//, ''),
  apiVersion: ApiVersion.January26,   // 2026-01
  isEmbeddedApp: false,
  restResources,
});

// ── PASO 1: Iniciar OAuth ────────────────────────────────────────────────────
// Ruta: GET /auth?shop=tu-tienda.myshopify.com
app.get('/auth', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Falta el parámetro ?shop=tu-tienda.myshopify.com');
  }

  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(shop, true),
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

// ── PASO 2: Callback OAuth ───────────────────────────────────────────────────
// Shopify redirige aquí con el código de autorización
app.get('/auth/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const session = callback.session;

    // Guarda el access token (en producción usa una DB)
    console.log('✅ Autenticación exitosa');
    console.log('   Shop:', session.shop);
    console.log('   Access Token:', session.accessToken);
    console.log('   Scopes:', session.scope);

    // Redirige a la app o muestra el token
    res.redirect(`/dashboard?shop=${session.shop}`);
  } catch (error) {
    console.error('❌ Error en callback OAuth:', error.message);
    res.status(500).send(`Error de autenticación: ${error.message}`);
  }
});

// ── PASO 3: Ejemplo de uso de la API 2026 ───────────────────────────────────
// Ruta de ejemplo: GET /dashboard?shop=tu-tienda.myshopify.com
app.get('/dashboard', async (req, res) => {
  const shop = req.query.shop;

  // En producción: recupera la sesión de tu DB
  // Aquí usamos una sesión de ejemplo para mostrar el uso de la API
  res.json({
    mensaje: 'App conectada correctamente',
    shop: shop,
    api_version: '2026-01',
    instrucciones: 'Usa el access_token para llamar a la REST o GraphQL API',
    ejemplos: {
      rest_productos: `GET https://${shop}/admin/api/2026-01/products.json`,
      graphql: `POST https://${shop}/admin/api/2026-01/graphql.json`,
    }
  });
});

// ── Ejemplo: llamar a la API con el access token ─────────────────────────────
// Función reutilizable para cualquier endpoint
async function llamarShopifyAPI(shop, accessToken, endpoint) {
  const client = new shopify.clients.Rest({ session: new Session({
    id: `${shop}_offline`,
    shop,
    state: '',
    isOnline: false,
    accessToken,
    scope: process.env.SHOPIFY_SCOPES,
  })});

  return await client.get({ path: endpoint });
}

// Ruta de ejemplo para obtener productos
app.get('/api/productos', async (req, res) => {
  const { shop, token } = req.query;
  if (!shop || !token) {
    return res.status(400).json({ error: 'Faltan parámetros: shop y token' });
  }

  try {
    const response = await llamarShopifyAPI(shop, token, 'products');
    res.json(response.body);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Servidor ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Shopify API 2026 - Gradi Handmade`);
  console.log(`   Servidor: http://localhost:${PORT}`);
  console.log(`   Inicia OAuth: http://localhost:${PORT}/auth?shop=TU-TIENDA.myshopify.com\n`);
});
