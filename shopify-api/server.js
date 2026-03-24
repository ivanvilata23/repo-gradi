/**
 * Shopify API - Gradi Handmade
 * Conexión directa con Admin API Token (sin OAuth, sin servidor público)
 *
 * SETUP:
 * 1. Ve a tu Admin de Shopify → Configuración → Apps y canales de venta
 * 2. Clic en "Desarrollar apps" → Crear una app
 * 3. En "Configuración de API de Admin" → elige los permisos que necesitas
 * 4. Clic en "Instalar app" → copia el "Token de API de Admin"
 * 5. Pega ese token en el .env como SHOPIFY_ADMIN_TOKEN
 * 6. Ejecuta: node server.js
 */

require('dotenv').config();

const SHOP    = process.env.SHOPIFY_SHOP;        // ej: gradi-handmade.myshopify.com
const TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN; // Admin API access token
const VERSION = '2025-07';

const BASE_URL = `https://${SHOP}/admin/api/${VERSION}`;

const headers = {
  'X-Shopify-Access-Token': TOKEN,
  'Content-Type': 'application/json',
};

// ── Función principal: llama a la API ────────────────────────────────────────
async function shopifyAPI(method, endpoint, body = null) {
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}/${endpoint}`, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Ejemplos de uso ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🛍️  Shopify API - Gradi Handmade`);
  console.log(`   Tienda : ${SHOP}`);
  console.log(`   Version: ${VERSION}\n`);

  try {
    // 1. Obtener info de la tienda
    const { shop } = await shopifyAPI('GET', 'shop.json');
    console.log('✅ Tienda conectada:', shop.name);
    console.log('   Email:', shop.email);
    console.log('   Moneda:', shop.currency);
    console.log('   Plan:', shop.plan_name);

    // 2. Listar productos
    const { products } = await shopifyAPI('GET', 'products.json?limit=5');
    console.log(`\n📦 Productos (primeros 5):`);
    products.forEach(p => console.log(`   - ${p.title} | ${p.status} | $${p.variants[0]?.price}`));

    // 3. Listar órdenes recientes
    const { orders } = await shopifyAPI('GET', 'orders.json?limit=5&status=any');
    console.log(`\n📋 Órdenes recientes:`);
    orders.forEach(o => console.log(`   - #${o.order_number} | ${o.financial_status} | $${o.total_price}`));

    console.log('\n✅ Conexión exitosa. La API funciona correctamente.\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('   Verifica que SHOPIFY_SHOP y SHOPIFY_ADMIN_TOKEN estén correctos en el .env\n');
  }
}

main();
