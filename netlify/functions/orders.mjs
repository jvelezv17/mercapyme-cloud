import { randomUUID } from "node:crypto";
import { validateOrder, maskEmail, maskPhone } from "../../src/validation.mjs";
import { saveOrder, listOrders } from "../../src/store.mjs";
import { json, clientIp, rateLimited, isAdmin, log, readJson } from "../../src/http.mjs";

export default async (req, context) => {
  const ip = clientIp(req, context);

  if (req.method === "POST") {
    if (rateLimited(`order:${ip}`, 10, 60_000)) {
      log("order_rate_limited");
      return json(429, { error: "Demasiadas solicitudes. Intente en un minuto." }, { "Retry-After": "60" });
    }
    if (!(req.headers.get("content-type") || "").includes("application/json")) {
      return json(415, { error: "Se espera application/json" });
    }
    let body;
    try { body = await readJson(req); } catch (e) { return json(e.status || 400, { error: "Solicitud inválida" }); }

    const result = validateOrder(body);
    if (!result.ok) {
      log("order_rejected", { reasons: result.errors.length });
      return json(422, { error: "Datos inválidos", details: result.errors });
    }
    const order = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "recibido",
      consentAt: new Date().toISOString(),
      ...result.order
    };
    await saveOrder(order);
    log("order_created", { orderId: order.id, total: order.total, items: order.lines.length });
    return json(201, { id: order.id, total: order.total, subtotal: order.subtotal, shipping: order.shipping, status: order.status });
  }

  if (req.method === "GET") {
    if (!isAdmin(req)) {
      log("admin_denied");
      return json(401, { error: "No autorizado" }, { "WWW-Authenticate": "Bearer" });
    }
    const orders = await listOrders(50);
    log("admin_list", { count: orders.length });
    return json(200, {
      orders: orders.map((o) => ({
        id: o.id, createdAt: o.createdAt, status: o.status, total: o.total,
        city: o.customer.city, name: o.customer.name.split(" ")[0],
        email: maskEmail(o.customer.email), phone: maskPhone(o.customer.phone),
        items: o.lines.map((l) => `${l.qty} x ${l.name}`)
      }))
    });
  }

  return json(405, { error: "Método no permitido" }, { Allow: "GET, POST" });
};

export const config = { path: "/api/orders" };
