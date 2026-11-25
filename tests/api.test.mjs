import { test, before, after } from "node:test";
import assert from "node:assert/strict";
process.env.MP_LOCAL = "1";
process.env.ADMIN_TOKEN = "token-local-de-pruebas-123";
const { createServer } = await import("../scripts/dev-server.mjs");
const { _resetRateLimit } = await import("../src/http.mjs");
let server, base;
before(async () => { server = createServer().listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const order = { name: "Luis Pérez", email: "luis@correo.com", phone: "3109876543", city: "Pereira", address: "Cra 7 # 20-15", consent: true, items: [{ id: "ARZ-500", qty: 4 }] };
const post = (body, headers = { "content-type": "application/json" }) => fetch(`${base}/api/orders`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("I01 GET /api/products devuelve 12 productos", async () => {
  const r = await fetch(`${base}/api/products`); const d = await r.json();
  assert.equal(r.status, 200); assert.equal(d.products.length, 12);
});
test("I02 POST /api/orders crea el pedido (201)", async () => {
  _resetRateLimit();
  const r = await post(order); const d = await r.json();
  assert.equal(r.status, 201); assert.equal(d.total, 4 * 3200 + 6000);
});
test("I03 datos inválidos devuelven 422 con detalle", async () => {
  const r = await post({ ...order, email: "x" }); assert.equal(r.status, 422);
});
test("I04 JSON mal formado devuelve 400 y tipo incorrecto 415", async () => {
  assert.equal((await post("{malo")).status, 400);
  assert.equal((await post(order, { "content-type": "text/plain" })).status, 415);
});
test("I05 cuerpo de más de 10 KB devuelve 413", async () => {
  assert.equal((await post({ ...order, address: "x".repeat(20000) })).status, 413);
});
test("I06 listar pedidos sin token devuelve 401", async () => {
  assert.equal((await fetch(`${base}/api/orders`)).status, 401);
});
test("I07 con token devuelve pedidos con contacto enmascarado", async () => {
  const r = await fetch(`${base}/api/orders`, { headers: { authorization: "Bearer token-local-de-pruebas-123" } });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.ok(d.orders.length >= 1);
  assert.ok(!JSON.stringify(d).includes("luis@correo.com"));
  assert.ok(!JSON.stringify(d).includes("3109876543"));
});
test("I08 el pedido 11 de la misma IP en un minuto devuelve 429", async () => {
  _resetRateLimit();
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await post(order)).status);
  assert.equal(codes.filter((c) => c === 201).length, 10);
  assert.equal(codes.at(-1), 429);
});
test("I09 método no permitido devuelve 405", async () => {
  assert.equal((await fetch(`${base}/api/products`, { method: "DELETE" })).status, 405);
});
test("I10 encabezados de seguridad presentes en páginas y API", async () => {
  for (const path of ["/", "/api/products"]) {
    const h = (await fetch(base + path)).headers;
    assert.match(h.get("content-security-policy"), /default-src '(self|none)'/);
    assert.equal(h.get("x-content-type-options"), "nosniff");
    assert.equal(h.get("x-frame-options"), "DENY");
    assert.ok(h.get("strict-transport-security"));
  }
});
test("I11 /api/health informa la instancia que atiende", async () => {
  const d = await (await fetch(`${base}/api/health`)).json();
  assert.equal(d.status, "ok"); assert.ok(d.instance);
});
