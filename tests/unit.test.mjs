import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOrder, maskEmail, maskPhone, clean } from "../src/validation.mjs";
import { rateLimited, _resetRateLimit, isAdmin } from "../src/http.mjs";
import { Node, strategies } from "../lb/balancer.mjs";

const base = { name: "Ana Gómez", email: "ana@correo.com", phone: "3001234567", city: "Armenia", address: "Calle 10 # 12-34", consent: true, items: [{ id: "CAF-500", qty: 2 }] };

test("U01 pedido válido calcula totales con precios del servidor", () => {
  const r = validateOrder(base);
  assert.equal(r.ok, true);
  assert.equal(r.order.subtotal, 37000);
  assert.equal(r.order.shipping, 6000);
  assert.equal(r.order.total, 43000);
});
test("U02 envío gratis desde $80.000", () => {
  const r = validateOrder({ ...base, items: [{ id: "CAF-500", qty: 5 }] });
  assert.equal(r.order.shipping, 0);
});
test("U03 ignora un precio manipulado por el cliente (rechaza campos extra)", () => {
  const r = validateOrder({ ...base, total: 1 });
  assert.equal(r.ok, false);
});
test("U04 rechaza pedido sin consentimiento (Ley 1581)", () => {
  assert.equal(validateOrder({ ...base, consent: false }).ok, false);
});
test("U05 rechaza producto inexistente, cantidad 0, negativa y decimal", () => {
  for (const items of [[{ id: "XXX", qty: 1 }], [{ id: "CAF-500", qty: 0 }], [{ id: "CAF-500", qty: -3 }], [{ id: "CAF-500", qty: 1.5 }]])
    assert.equal(validateOrder({ ...base, items }).ok, false);
});
test("U06 rechaza intento de inyección HTML en el nombre", () => {
  assert.equal(validateOrder({ ...base, name: "<script>alert(1)</script>" }).ok, false);
});
test("U07 rechaza ciudad sin cobertura y correo inválido", () => {
  assert.equal(validateOrder({ ...base, city: "Bogotá" }).ok, false);
  assert.equal(validateOrder({ ...base, email: "ana@" }).ok, false);
});
test("U08 enmascara correo y teléfono", () => {
  assert.equal(maskEmail("ana@correo.com"), "a***@correo.com");
  assert.equal(maskPhone("3001234567"), "******4567");
});
test("U09 limpia caracteres de control", () => {
  assert.equal(clean(" hola\u0000\u0007 "), "hola");
});
test("U10 límite de peticiones bloquea la petición 11 en un minuto", () => {
  _resetRateLimit();
  let blocked = 0;
  for (let i = 0; i < 11; i++) if (rateLimited("t", 10, 60_000)) blocked++;
  assert.equal(blocked, 1);
});
test("U11 token de administración: válido, inválido y sin configurar", () => {
  process.env.ADMIN_TOKEN = "un-token-largo-de-prueba-123";
  const req = (h) => new Request("http://x", { headers: h ? { authorization: h } : {} });
  assert.equal(isAdmin(req("Bearer un-token-largo-de-prueba-123")), true);
  assert.equal(isAdmin(req("Bearer otro")), false);
  assert.equal(isAdmin(req()), false);
  process.env.ADMIN_TOKEN = "corto";
  assert.equal(isAdmin(req("Bearer corto")), false);
});
test("U12 balanceador predictivo elige el nodo con menor costo esperado", () => {
  const a = new Node("a", 1), b = new Node("b", 2);
  for (let i = 0; i < 10; i++) { a.observe(10, 1); b.observe(50, 1); }
  assert.equal(strategies.predictive([a, b]).name, "a");
  a.inflight = 8; // a congestionado
  assert.equal(strategies.predictive([a, b]).name, "b");
});
test("U13 balanceador excluye nodos no sanos", () => {
  const a = new Node("a", 1), b = new Node("b", 2);
  a.healthy = false;
  assert.equal(strategies.leastConnections([a, b]).name, "b");
  assert.equal(strategies.roundRobin([a, b], {}).name, "b");
});
