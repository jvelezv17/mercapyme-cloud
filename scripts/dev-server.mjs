// Servidor local que imita Netlify: sirve /public con los mismos encabezados
// y enruta /api/* a las funciones serverless. Uso: npm run dev  (PORT opcional)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

process.env.MP_LOCAL = process.env.MP_LOCAL || "1";
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "token-local-de-pruebas-123";

const root = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(root, "public");
const fns = {};
for (const name of ["products", "orders", "health"]) {
  const mod = await import(join(root, "netlify/functions", `${name}.mjs`));
  fns[mod.config.path] = mod.default;
}
const STATIC_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const fn = fns[url.pathname];
    if (fn) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const response = await fn(request, { ip: req.socket.remoteAddress });
      const merged = Object.fromEntries(Object.entries(STATIC_HEADERS).map(([k, v]) => [k.toLowerCase(), v]));
      for (const [k, v] of response.headers) merged[k] = v; // la función manda
      res.writeHead(response.status, merged);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = await readFile(join(PUBLIC, path));
      res.writeHead(200, { ...STATIC_HEADERS, "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { ...STATIC_HEADERS, "Content-Type": "text/plain" }); res.end("No encontrado");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8888);
  createServer().listen(port, () => console.log(`MercaPyme local en http://localhost:${port}`));
}
