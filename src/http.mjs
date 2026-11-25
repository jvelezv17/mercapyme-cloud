import { randomUUID, timingSafeEqual, createHash } from "node:crypto";

// Identificador de la instancia de cómputo. Cambia en cada arranque en frío:
// sirve para ver cuántas instancias levantó la plataforma durante una prueba de carga.
export const INSTANCE_ID = randomUUID().slice(0, 8);
export const STARTED_AT = Date.now();

export const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // En Netlify los encabezados de netlify.toml no se aplican a las funciones: la API pone los suyos.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Instance-Id": INSTANCE_ID
};

export function json(status, data, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

export function clientIp(req, context) {
  return context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

// Límite de peticiones por IP (ventana deslizante, por instancia).
const hits = new Map();
export function rateLimited(key, max, windowMs, now = Date.now()) {
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear(); // evita crecimiento sin límite
  return list.length > max;
}
export function _resetRateLimit() { hits.clear(); }

// Comparación en tiempo constante del token de administración (variable de entorno, nunca en el código).
export function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false;
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Registro estructurado sin datos personales.
export function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), instance: INSTANCE_ID, event, ...fields }));
}

export async function readJson(req, maxBytes = 10_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("payload"), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error("json"), { status: 400 }); }
}
