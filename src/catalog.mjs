// Catálogo de productos de MercaPyme (solo lectura).
// El precio siempre se toma de aquí en el servidor: nunca se confía en el precio que envía el navegador.
export const CATALOG = Object.freeze([
  { id: "ARZ-500", name: "Arroz blanco 500 g", category: "Granos", price: 3200, unit: "paquete" },
  { id: "FRJ-500", name: "Fríjol cargamanto 500 g", category: "Granos", price: 7900, unit: "paquete" },
  { id: "LEN-500", name: "Lenteja 500 g", category: "Granos", price: 4500, unit: "paquete" },
  { id: "ACE-1L", name: "Aceite vegetal 1 L", category: "Despensa", price: 11900, unit: "botella" },
  { id: "AZU-1K", name: "Azúcar 1 kg", category: "Despensa", price: 5400, unit: "bolsa" },
  { id: "SAL-1K", name: "Sal refinada 1 kg", category: "Despensa", price: 2300, unit: "bolsa" },
  { id: "CAF-500", name: "Café molido de Quindío 500 g", category: "Bebidas", price: 18500, unit: "paquete" },
  { id: "PAN-12", name: "Panela orgánica x 2", category: "Bebidas", price: 6200, unit: "paquete" },
  { id: "LEC-1L", name: "Leche entera 1 L", category: "Lácteos", price: 4300, unit: "bolsa" },
  { id: "HUE-30", name: "Huevos AA x 30", category: "Lácteos", price: 19800, unit: "panal" },
  { id: "JAB-3", name: "Jabón de barra x 3", category: "Aseo", price: 8900, unit: "paquete" },
  { id: "DET-1K", name: "Detergente en polvo 1 kg", category: "Aseo", price: 12500, unit: "bolsa" }
]);

const BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export function findProduct(id) {
  return BY_ID.get(id) ?? null;
}

export const SHIPPING_FLAT = 6000;      // domicilio en COP
export const FREE_SHIPPING_FROM = 80000; // envío gratis desde este subtotal
