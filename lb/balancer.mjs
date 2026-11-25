// Balanceador de carga HTTP con tres estrategias:
//  - roundRobin: reparte en turno fijo (estático, línea base)
//  - leastConnections: envía al nodo con menos peticiones en curso (dinámico reactivo)
//  - predictive: estima el tiempo de respuesta esperado de cada nodo a partir de su historia reciente
//    (latencia suavizada + tendencia) y de su carga actual, y elige el menor.
//    Es una adaptación ligera del enfoque predictivo y adaptativo de Rajammal y Chinnadurai (2025):
//    en lugar de una red neuronal de grafos temporales usa un predictor estadístico (EWMA con tendencia),
//    viable en una aplicación pequeña y sin entrenamiento previo.
import http from "node:http";

export class Node {
  constructor(name, port) {
    Object.assign(this, { name, port, inflight: 0, served: 0, errors: 0, healthy: true });
    this.pending = new Set(); // peticiones en curso: { t0, load }
    this.ewma = 5;       // latencia por unidad de carga suavizada (ms), valor inicial optimista
    this.trend = 0;      // tendencia de la latencia (ms por petición)
    this.alpha = 0.3;    // peso de la observación nueva
    this.beta = 0.1;     // peso de la tendencia
  }
  // ms = latencia observada; load = peticiones que el nodo tenía en curso al despachar (incluida esta).
  // Se aprende la latencia por unidad de carga, que no se infla cuando el nodo tiene cola.
  observe(ms, load = 1) {
    const perUnit = ms / Math.max(1, load);
    const prev = this.ewma;
    // Suavizado adaptativo: si el error de pronóstico es grande (el nodo cambió de comportamiento),
    // se le da más peso a la observación nueva para reaccionar rápido.
    const forecast = Math.max(0.1, this.ewma + this.trend);
    const surprise = Math.abs(perUnit - forecast) / forecast;
    const a = surprise > 0.5 ? 0.8 : this.alpha;
    this.ewma = a * perUnit + (1 - a) * forecast;
    this.trend = this.beta * (this.ewma - prev) + (1 - this.beta) * this.trend;
  }
  // Tiempo esperado si recibe una petición más: latencia por unidad pronosticada × (cola + 1)
  // Protección contra el "efecto manada": si una petición en curso ya lleva más tiempo del pronosticado,
  // el nodo se volvió lento aunque todavía no haya terminado ninguna; se usa esa evidencia de inmediato.
  predictedCost(now = performance.now()) {
    let forecast = Math.max(0.1, this.ewma + this.trend);
    for (const p of this.pending) forecast = Math.max(forecast, (now - p.t0) / p.load);
    return forecast * (this.inflight + 1);
  }
}

export const strategies = {
  roundRobin(nodes, state) {
    const healthy = nodes.filter((n) => n.healthy);
    state.i = ((state.i ?? -1) + 1) % healthy.length;
    return healthy[state.i];
  },
  leastConnections(nodes) {
    return nodes.filter((n) => n.healthy).reduce((a, b) => (b.inflight < a.inflight ? b : a));
  },
  predictive(nodes) {
    const now = performance.now();
    return nodes.filter((n) => n.healthy).reduce((a, b) => (b.predictedCost(now) < a.predictedCost(now) ? b : a));
  }
};

export function createBalancer(nodes, strategyName) {
  const pick = strategies[strategyName];
  const state = {};
  const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });

  // Chequeo de salud cada 500 ms: un nodo que no responde sale de la rotación.
  const hc = setInterval(() => {
    for (const n of nodes) {
      const r = http.get({ port: n.port, path: "/health", agent, timeout: 300 }, (res) => { n.healthy = res.statusCode === 200; res.resume(); });
      r.on("timeout", () => { n.healthy = false; r.destroy(); });
      r.on("error", () => { n.healthy = false; });
    }
  }, 500);

  const server = http.createServer((req, res) => {
    const node = pick(nodes, state);
    if (!node) { res.writeHead(503); return res.end("sin nodos sanos"); }
    node.inflight++;
    const load = node.inflight;
    const t0 = performance.now();
    const ticket = { t0, load };
    node.pending.add(ticket);
    const up = http.request({ port: node.port, path: req.url, method: req.method, headers: req.headers, agent }, (ur) => {
      res.writeHead(ur.statusCode, { ...ur.headers, "x-served-by": node.name });
      ur.pipe(res);
      ur.on("end", () => { node.pending.delete(ticket); node.inflight--; node.served++; node.observe(performance.now() - t0, load); });
    });
    up.on("error", () => { node.pending.delete(ticket); node.inflight--; node.errors++; node.healthy = false; res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  server.on("close", () => clearInterval(hc));
  return server;
}
