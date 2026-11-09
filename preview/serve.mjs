import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const directory = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 4191);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid port");
createServer((request, response) => {
  if (request.url !== "/") { response.writeHead(404).end(); return; }
  try { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(readFileSync(resolve(directory, "index.html"))); }
  catch { response.writeHead(503).end("Build preview first"); }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
