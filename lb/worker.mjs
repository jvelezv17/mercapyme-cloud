// Nodo de cómputo de prueba: atiende /api/orders con capacidad limitada (N peticiones en paralelo)
// y un tiempo de servicio propio. Recibe por mensaje cambios de velocidad (degradación).
import http from "node:http";
const port = Number(process.argv[2]);
let serviceMs = Number(process.argv[3]);
const capacity = Number(process.argv[4] || 4);
let busy = 0; const queue = [];
process.on("message", (m) => { if (m.serviceMs) serviceMs = m.serviceMs; });

function run(job) {
  busy++;
  const jitter = serviceMs * (0.85 + Math.random() * 0.3);
  setTimeout(() => { busy--; job(); if (queue.length) run(queue.shift()); }, jitter);
}
http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  req.resume();
  const job = () => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}'); };
  busy < capacity ? run(job) : queue.push(job);
}).listen(port, () => process.send?.("ready"));
