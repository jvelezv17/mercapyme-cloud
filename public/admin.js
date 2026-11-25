const $ = (id) => document.getElementById(id);
const money = (n) => "$" + Number(n).toLocaleString("es-CO");
// El token solo vive en memoria de la página: no se guarda en localStorage.
$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await fetch("/api/orders", { headers: { Authorization: `Bearer ${$("token").value}` } });
  if (res.status !== 200) { $("amsg").textContent = "Token inválido."; $("tbl").hidden = true; return; }
  const { orders } = await res.json();
  $("amsg").textContent = `${orders.length} pedido(s).`;
  const tb = $("rows"); tb.replaceChildren();
  for (const o of orders) {
    const tr = document.createElement("tr");
    for (const v of [new Date(o.createdAt).toLocaleString("es-CO"), o.name, `${o.email} · ${o.phone}`, o.city, o.items.join(", "), money(o.total)]) {
      const td = document.createElement("td"); td.textContent = v; tr.append(td);
    }
    tb.append(tr);
  }
  $("tbl").hidden = false;
});
