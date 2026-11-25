// Pruebas de punta a punta con Playwright sobre el servidor local (o BASE_URL si se pasa una URL de Netlify).
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

let base = process.env.BASE_URL, server;
if (!base) {
  process.env.MP_LOCAL = "1"; process.env.ADMIN_TOKEN = "token-local-de-pruebas-123";
  const { createServer } = await import("../scripts/dev-server.mjs");
  server = createServer().listen(0); await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
}
const shots = process.env.SHOTS || "docs/img";
const browser = await chromium.launch();
const results = [];
async function step(id, name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ id, name, ok: true, ms: Date.now() - t }); console.log("ok", id, name); }
  catch (e) { results.push({ id, name, ok: false, error: e.message }); console.log("FAIL", id, name, e.message); }
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

await step("E01", "El catálogo carga 12 productos", async () => {
  await page.goto(base);
  await page.locator("[data-testid^=product-]").first().waitFor();
  assert.equal(await page.locator("[data-testid^=product-]").count(), 12);
  await page.screenshot({ path: `${shots}/01-catalogo.png` });
});
await step("E02", "El filtro por categoría muestra solo Bebidas", async () => {
  await page.selectOption("#category", "Bebidas");
  assert.equal(await page.locator("[data-testid^=product-]").count(), 2);
  await page.selectOption("#category", "");
});
await step("E03", "Agregar productos actualiza carrito y total", async () => {
  await page.click("[data-testid=product-CAF-500] button");
  await page.click("[data-testid=product-CAF-500] button");
  await page.click("[data-testid=product-ARZ-500] button");
  assert.equal(await page.textContent("[data-testid=cart-count]"), "3");
  assert.equal((await page.textContent("[data-testid=total]")).replace(/\s/g, ""), "$46.200");
});
await step("E04", "Sin consentimiento el pedido se rechaza", async () => {
  await page.fill("input[name=name]", "Ana Gómez");
  await page.fill("input[name=email]", "ana@correo.com");
  await page.fill("input[name=phone]", "3001234567");
  await page.selectOption("select[name=city]", "Armenia");
  await page.fill("input[name=address]", "Calle 10 # 12-34");
  await page.click("#submitBtn");
  await page.waitForFunction(() => document.querySelector("[data-testid=form-msg]").textContent.length > 0);
  assert.match(await page.textContent("[data-testid=form-msg]"), /política de tratamiento/);
});
await step("E05", "Con consentimiento el pedido se confirma", async () => {
  await page.check("input[name=consent]");
  await page.click("#submitBtn");
  await page.waitForFunction(() => /Pedido recibido/.test(document.querySelector("[data-testid=form-msg]").textContent));
  await page.locator("#cart").screenshot({ path: `${shots}/02-pedido-confirmado.png` });
  assert.equal(await page.textContent("[data-testid=cart-count]"), "0");
});
await step("E06", "El panel rechaza un token inválido", async () => {
  await page.goto(`${base}/admin.html`);
  await page.fill("#token", "token-incorrecto-1234567");
  await page.click("#login button");
  await page.waitForFunction(() => document.querySelector("[data-testid=admin-msg]").textContent.length > 0);
  assert.match(await page.textContent("[data-testid=admin-msg]"), /inválido/);
});
await step("E07", "El panel muestra pedidos con datos enmascarados", async () => {
  if (process.env.BASE_URL && !process.env.ADMIN_TOKEN) return; // en la nube solo si se pasa el token
  await page.fill("#token", process.env.ADMIN_TOKEN);
  await page.click("#login button");
  await page.locator("#tbl:not([hidden])").waitFor();
  const text = await page.textContent("#rows");
  assert.ok(text.includes("a***@correo.com") && !text.includes("ana@correo.com"));
  await page.screenshot({ path: `${shots}/03-panel-admin.png` });
});
await step("E08", "La página no genera errores de consola (CSP sin violaciones)", async () => {
  assert.deepEqual(consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of (401|422)/.test(e)), []);
});
const mob = await browser.newContext({ ...devices["iPhone 13"] });
const mp = await mob.newPage();
await step("E09", "La interfaz funciona en celular", async () => {
  await mp.goto(base);
  await mp.locator("[data-testid^=product-]").first().waitFor();
  await mp.click("[data-testid=product-HUE-30] button");
  assert.equal(await mp.textContent("[data-testid=cart-count]"), "1");
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false);
  await mp.screenshot({ path: `${shots}/04-movil.png` });
});
await browser.close(); server?.close();
writeFileSync(process.env.E2E_OUT || "tests/e2e-results.json", JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} pruebas E2E aprobadas`);
process.exit(failed ? 1 : 0);
