const money = (n) => "$" + Number(n).toLocaleString("es-CO");
const $ = (id) => document.getElementById(id);
const state = { products: [], cart: new Map(), shipping: { flat: 6000, freeFrom: 80000 } };

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text; // nunca innerHTML con datos
  return e;
}

async function loadCatalog() {
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state.products = data.products;
    state.shipping = data.shipping;
    $("freeFrom").textContent = money(state.shipping.freeFrom);
    const cats = [...new Set(state.products.map((p) => p.category))];
    for (const c of cats) $("category").append(el("option", { value: c }, c));
    $("status").textContent = "";
    renderGrid();
  } catch {
    $("status").textContent = "No pudimos cargar el catálogo. Intenta de nuevo en unos segundos.";
  }
}

function renderGrid() {
  const cat = $("category").value;
  const grid = $("grid");
  grid.replaceChildren();
  for (const p of state.products.filter((x) => !cat || x.category === cat)) {
    const card = el("article", { class: "card", "data-testid": `product-${p.id}` });
    const tile = el("div", { class: "tile", "aria-hidden": "true" }, p.name.slice(0, 2).toUpperCase());
    tile.dataset.cat = p.category;
    card.append(tile, el("h3", {}, p.name), el("p", { class: "muted" }, `${p.category} · ${p.unit}`), el("p", { class: "price" }, money(p.price)));
    const btn = el("button", { type: "button", "data-id": p.id }, "Agregar");
    btn.addEventListener("click", () => addToCart(p.id, 1));
    card.append(btn);
    grid.append(card);
  }
}

function addToCart(id, delta) {
  const q = (state.cart.get(id) || 0) + delta;
  if (q <= 0) state.cart.delete(id); else state.cart.set(id, Math.min(q, 50));
  renderCart();
}

function totals() {
  let subtotal = 0;
  for (const [id, qty] of state.cart) subtotal += state.products.find((p) => p.id === id).price * qty;
  const shipping = subtotal === 0 ? 0 : subtotal >= state.shipping.freeFrom ? 0 : state.shipping.flat;
  return { subtotal, shipping, total: subtotal + shipping };
}

function renderCart() {
  const ul = $("cartLines");
  ul.replaceChildren();
  let count = 0;
  for (const [id, qty] of state.cart) {
    const p = state.products.find((x) => x.id === id);
    count += qty;
    const li = el("li");
    li.append(el("span", { class: "ln" }, p.name), el("span", { class: "qty" }, `x${qty}`));
    const minus = el("button", { type: "button", class: "mini", "aria-label": `Quitar uno de ${p.name}` }, "−");
    const plus = el("button", { type: "button", class: "mini", "aria-label": `Agregar uno de ${p.name}` }, "+");
    minus.addEventListener("click", () => addToCart(id, -1));
    plus.addEventListener("click", () => addToCart(id, 1));
    li.append(minus, plus, el("span", { class: "lt" }, money(p.price * qty)));
    ul.append(li);
  }
  const t = totals();
  $("cartCount").textContent = count;
  $("cartEmpty").hidden = count > 0;
  $("subtotal").textContent = money(t.subtotal);
  $("shipping").textContent = t.subtotal && !t.shipping ? "Gratis" : money(t.shipping);
  $("total").textContent = money(t.total);
}

$("category").addEventListener("change", renderGrid);
$("cartBtn").addEventListener("click", () => $("cart").scrollIntoView({ behavior: "smooth" }));

$("checkout").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const msg = $("formMsg");
  msg.className = "msg";
  if (state.cart.size === 0) { msg.textContent = "Agrega al menos un producto."; msg.classList.add("err"); return; }
  const f = new FormData(ev.target);
  const body = {
    name: f.get("name"), email: f.get("email"), phone: f.get("phone"),
    city: f.get("city"), address: f.get("address"), consent: f.get("consent") === "on",
    items: [...state.cart].map(([id, qty]) => ({ id, qty }))
  };
  $("submitBtn").disabled = true;
  try {
    const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.status === 201) {
      msg.textContent = `Pedido recibido. Número: ${data.id.slice(0, 8).toUpperCase()} · Total ${money(data.total)}`;
      msg.classList.add("ok");
      state.cart.clear(); renderCart(); ev.target.reset();
    } else {
      msg.textContent = (data.details || [data.error]).join(" ");
      msg.classList.add("err");
    }
  } catch {
    msg.textContent = "No pudimos enviar el pedido. Revisa tu conexión.";
    msg.classList.add("err");
  } finally {
    $("submitBtn").disabled = false;
  }
});

loadCatalog();
