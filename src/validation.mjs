import { findProduct, SHIPPING_FLAT, FREE_SHIPPING_FROM } from "./catalog.mjs";

const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i;
const PHONE_RE = /^\+?[0-9 ]{7,15}$/;
const NAME_RE = /^[\p{L} .'-]{2,80}$/u;
const MAX_ITEMS = 20;
const MAX_QTY = 50;
const ALLOWED_FIELDS = new Set(["name", "email", "phone", "city", "address", "items", "consent"]);
export const CITIES = ["Armenia", "Pereira", "Manizales", "Calarcá", "Montenegro"];

// Quita caracteres de control y recorta. No se guarda HTML: el frontend siempre pinta con textContent.
export function clean(value, max = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

/**
 * Valida un pedido y recalcula totales con los precios del servidor.
 * Devuelve { ok: true, order } o { ok: false, errors: [...] }.
 */
export function validateOrder(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["El cuerpo debe ser un objeto JSON."] };
  }
  const unknown = Object.keys(body).filter((k) => !ALLOWED_FIELDS.has(k));
  if (unknown.length) errors.push(`Campos no permitidos: ${unknown.join(", ")}.`);

  const name = clean(body.name, 80);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 15);
  const city = clean(body.city, 40);
  const address = clean(body.address, 120);

  if (!NAME_RE.test(name)) errors.push("Nombre inválido.");
  if (!EMAIL_RE.test(email)) errors.push("Correo inválido.");
  if (!PHONE_RE.test(phone)) errors.push("Teléfono inválido.");
  if (!CITIES.includes(city)) errors.push("Ciudad no disponible para domicilio.");
  if (address.length < 5) errors.push("Dirección inválida.");
  if (body.consent !== true) errors.push("Debe aceptar la política de tratamiento de datos.");

  const lines = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push("El pedido no tiene productos.");
  } else if (body.items.length > MAX_ITEMS) {
    errors.push(`Máximo ${MAX_ITEMS} productos distintos por pedido.`);
  } else {
    const seen = new Set();
    for (const item of body.items) {
      const product = findProduct(clean(item?.id, 20));
      const qty = Number(item?.qty);
      if (!product) { errors.push("Producto inexistente."); continue; }
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) { errors.push(`Cantidad inválida para ${product.id}.`); continue; }
      if (seen.has(product.id)) { errors.push(`Producto repetido: ${product.id}.`); continue; }
      seen.add(product.id);
      lines.push({ id: product.id, name: product.name, price: product.price, qty, total: product.price * qty });
    }
  }

  if (errors.length) return { ok: false, errors };

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const shipping = subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FLAT;
  return {
    ok: true,
    order: { customer: { name, email, phone, city, address }, lines, subtotal, shipping, total: subtotal + shipping }
  };
}

// Minimización de datos (Ley 1581): lo que ve el administrador sale enmascarado.
export function maskEmail(email) {
  const [user, domain] = String(email).split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
