// Adaptador de almacenamiento.
// En Netlify usa Netlify Blobs (almacenamiento de objetos administrado, cifrado en reposo por el proveedor).
// En local (MP_LOCAL=1) usa memoria, para poder probar sin cuenta de nube.
import { getStore } from "@netlify/blobs";

const memory = new Map();

const memoryStore = {
  async setJSON(key, value) { memory.set(key, JSON.stringify(value)); },
  async get(key, opts) {
    const v = memory.get(key);
    if (v === undefined) return null;
    return opts?.type === "json" ? JSON.parse(v) : v;
  },
  async list({ prefix = "" } = {}) {
    return { blobs: [...memory.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
  },
  _reset() { memory.clear(); }
};

export function ordersStore() {
  if (process.env.MP_LOCAL === "1") return memoryStore;
  // consistency "strong": un pedido recién creado se ve de inmediato en el panel.
  return getStore({ name: "orders", consistency: "strong" });
}

export async function saveOrder(order) {
  await ordersStore().setJSON(`order/${order.createdAt}_${order.id}`, order);
}

export async function listOrders(limit = 50) {
  const store = ordersStore();
  const { blobs } = await store.list({ prefix: "order/" });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const orders = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));
  return orders.filter(Boolean);
}

export const _memoryStore = memoryStore;
