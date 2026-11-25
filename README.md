# MercaPyme Cloud

Catálogo y pedidos a domicilio para una pyme del Eje Cafetero, desplegado como aplicación **serverless** en Netlify (que corre sobre AWS Lambda y una CDN global).

| Capa | Servicio |
|---|---|
| Frontend estático | Netlify CDN (`public/`) |
| Cómputo | Netlify Functions (`netlify/functions/`): `/api/products`, `/api/orders`, `/api/health` |
| Almacenamiento | Netlify Blobs (almacén `orders`) |
| Balanceo | Automático de la plataforma (CDN + escalado de funciones) y balanceador predictivo propio (`lb/`) evaluado en laboratorio |

## Ejecutar en local
```bash
npm install
npm run dev          # http://localhost:8888  (token admin local: token-local-de-pruebas-123)
npm test             # 24 pruebas unitarias y de integración
npm run test:e2e     # 9 pruebas de punta a punta con Playwright
npm run lb:test      # experimento de balanceo (round robin vs menos conexiones vs predictivo)
```

## Seguridad
HTTPS obligatorio (HSTS), CSP estricta, validación de entrada en el servidor, recálculo de precios en el servidor, límite de 10 pedidos por minuto por IP, token de administración en variable de entorno, datos de contacto enmascarados en el panel, consentimiento explícito (Ley 1581 de 2012) y registros sin datos personales.
