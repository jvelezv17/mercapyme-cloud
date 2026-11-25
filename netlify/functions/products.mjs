import { CATALOG, SHIPPING_FLAT, FREE_SHIPPING_FROM } from "../../src/catalog.mjs";
import { json, SECURITY_HEADERS } from "../../src/http.mjs";

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Método no permitido" }, { Allow: "GET" });
  // El catálogo es público y cambia poco: se cachea 60 s en la CDN.
  return json(200, { products: CATALOG, shipping: { flat: SHIPPING_FLAT, freeFrom: FREE_SHIPPING_FROM } },
    { ...SECURITY_HEADERS, "Cache-Control": "public, max-age=60" });
};

export const config = { path: "/api/products" };
