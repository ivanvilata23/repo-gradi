# Shopify API 2026 - Gradi Handmade

## Pasos para configurar

### 1. Obtener Client ID y Secret
1. Ve a [Shopify Partners](https://partners.shopify.com)
2. Crear app → **App personalizada** o **App pública**
3. Copia el **Client ID** (`API key`) y el **Client Secret** (`API secret key`)

### 2. Configurar variables de entorno
```bash
cp .env.example .env
```
Edita `.env` con tus credenciales:
```
SHOPIFY_API_KEY=abc123...        # ← Tu Client ID
SHOPIFY_API_SECRET=xyz789...     # ← Tu Client Secret
```

### 3. Instalar y ejecutar
```bash
npm install
npm start
```

### 4. Autenticar tu tienda
Abre en el navegador:
```
http://localhost:3000/auth?shop=TU-TIENDA.myshopify.com
```
Shopify te pedirá autorizar la app → obtienes el **access token**.

## Versión API
Este setup usa `2026-01` (la más reciente de 2026).

## Endpoints incluidos
| Ruta | Descripción |
|------|-------------|
| `GET /auth?shop=...` | Inicia el flujo OAuth |
| `GET /auth/callback` | Callback de Shopify (automático) |
| `GET /dashboard?shop=...` | Info de la conexión |
| `GET /api/productos?shop=...&token=...` | Lista productos |
