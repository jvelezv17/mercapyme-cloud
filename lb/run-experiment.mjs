// Experimento de balanceo: 3 nodos heterogéneos, 3 fases de carga y degradación de un nodo.
// Compara round robin, menos conexiones y el balanceador predictivo. Guarda resultados en lb/results.json
import { fork } from "node:child_process";
import { writeFileSync } from "node:fs";
import autocannon from "autocannon";
import { createBalancer, Node } from "./balancer.mjs";

const NODES = [
  { name: "nodo-A", port: 9101, ms: 10, cap: 4 },
  { name: "nodo-B", port: 9102, ms: 25, cap: 4 },
  { name: "nodo-C", port: 9103, ms: 60, cap: 4 }
];
const PHASES = [
  { name: "Carga baja", connections: 20, duration: 8 },
  { name: "Pico de demanda", connections: 120, duration: 8 },
  { name: "Pico con nodo A degradado", connections: 120, duration: 8, degrade: { node: "nodo-A", ms: 90 } }
];
const BODY = JSON.stringify({ items: [{ id: "CAF-500", qty: 1 }] });

const startWorkers = () => Promise.all(NODES.map((n) => new Promise((ok) => {
  const p = fork(new URL("./worker.mjs", import.meta.url), [n.port, n.ms, n.cap]);
  p.once("message", () => ok({ ...n, proc: p }));
})));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = { generatedAt: new Date().toISOString(), nodes: NODES.map(({ proc, ...n }) => n), phases: PHASES, runs: [] };

const REPS = Number(process.env.REPS || 3);
for (let rep = 1; rep <= REPS; rep++)
for (const strategy of ["roundRobin", "leastConnections", "predictive"]) {
  const workers = await startWorkers();
  const nodes = workers.map((w) => new Node(w.name, w.port));
  const lb = createBalancer(nodes, strategy);
  await new Promise((r) => lb.listen(9100, r));
  await sleep(600);
  const run = { strategy, rep, phases: [] };
  for (const ph of PHASES) {
    if (ph.degrade) workers.find((w) => w.name === ph.degrade.node).proc.send({ serviceMs: ph.degrade.ms });
    const before = nodes.map((n) => n.served);
    const r = await autocannon({ url: "http://127.0.0.1:9100/api/orders", method: "POST", body: BODY,
      headers: { "content-type": "application/json" }, connections: ph.connections, duration: ph.duration });
    const share = Object.fromEntries(nodes.map((n, i) => [n.name, n.served - before[i]]));
    run.phases.push({ phase: ph.name, connections: ph.connections, rps: Math.round(r.requests.average),
      total: r.requests.total, p50: r.latency.p50, p97_5: r.latency.p97_5, p99: r.latency.p99, avg: r.latency.average,
      errors: r.errors + r.non2xx, share });
    console.log(rep, strategy, ph.name, `rps=${Math.round(r.requests.average)} p50=${r.latency.p50} p97.5=${r.latency.p97_5} p99=${r.latency.p99} err=${r.errors + r.non2xx}`, share);
  }
  results.runs.push(run);
  lb.close(); workers.forEach((w) => w.proc.kill());
  await sleep(500);
}

// Prueba de tolerancia a fallos: se apaga el nodo B a mitad de la prueba con el balanceador predictivo.
{
  const workers = await startWorkers();
  const nodes = workers.map((w) => new Node(w.name, w.port));
  const lb = createBalancer(nodes, "predictive");
  await new Promise((r) => lb.listen(9100, r));
  await sleep(600);
  setTimeout(() => workers.find((w) => w.name === "nodo-B").proc.kill(), 4000);
  const r = await autocannon({ url: "http://127.0.0.1:9100/api/orders", method: "POST", body: BODY,
    headers: { "content-type": "application/json" }, connections: 60, duration: 10 });
  results.failover = { connections: 60, duration: 10, killedAtSec: 4, total: r.requests.total, errors: r.errors + r.non2xx,
    errorRatePct: +(100 * (r.errors + r.non2xx) / Math.max(1, r.requests.total)).toFixed(3), p99: r.latency.p99,
    share: Object.fromEntries(nodes.map((n) => [n.name, n.served])) };
  console.log("failover", results.failover);
  lb.close(); workers.forEach((w) => w.proc.kill());
}
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2));
console.log("listo");
process.exit(0);
