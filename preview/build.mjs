import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Offline preview bundler. The component is unchanged; only reports are simulated.
const directory = dirname(fileURLToPath(import.meta.url));
const project = resolve(process.argv[2] ?? ".");
const projectRequire = createRequire(resolve(project, "package.json"));
const ts = projectRequire("typescript");
const packageFile = (name, path) => resolve(dirname(projectRequire.resolve(`${name}/package.json`)), path);
const packages = {
  react: packageFile("react", "cjs/react.production.js"),
  "react/jsx-runtime": packageFile("react", "cjs/react-jsx-runtime.production.js"),
  "react-dom": packageFile("react-dom", "cjs/react-dom.production.js"),
  "react-dom/client": packageFile("react-dom", "cjs/react-dom-client.production.js"),
};
packages.scheduler = createRequire(packages["react-dom/client"]).resolve("scheduler").replace(/index\.js$/, "cjs/scheduler.production.js");
const modules = [], ids = new Map(), cssParts = [];
function resolveImport(specifier, importer) {
  if (specifier === "@/lib/account-performance-loader") return resolve(directory, "demo-data.ts");
  if (specifier === "@/lib/account-performance") return resolve(directory, "../payload/lib/account-performance.ts");
  if (packages[specifier]) return packages[specifier];
  if (!specifier.startsWith(".")) throw Error(`Unexpected dependency: ${specifier}`);
  const path = resolve(dirname(importer), specifier);
  const found = [path, `${path}.ts`, `${path}.tsx`, `${path}.js`].find(p => existsSync(p));
  if (!found) throw Error(`Missing source: ${specifier}`);
  return found;
}
function add(path) {
  if (ids.has(path)) return ids.get(path);
  const id = modules.length; ids.set(path, id); modules.push("");
  let source = readFileSync(path, "utf8");
  if (path.endsWith(".css")) {
    const classes = {};
    if (path.endsWith(".module.css")) source = source.replace(/\.([A-Za-z_][\w-]*)/g, (_, name) => { classes[name] = `ap-source-${name}`; return `.${classes[name]}`; });
    cssParts.push(source); modules[id] = `module.exports=${JSON.stringify(classes)};`; return id;
  }
  const extension = extname(path);
  if (extension === ".ts" || extension === ".tsx") {
    const result = ts.transpileModule(source, { fileName: basename(path), compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, removeComments: true }, reportDiagnostics: true });
    const errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: f => f, getCurrentDirectory: () => project, getNewLine: () => "\n" }));
    source = result.outputText;
  }
  source = source.replace(/process\.env\.NODE_ENV/g, '"production"');
  source = source.replace(/\brequire\(["']([^"']+)["']\)/g, (_, specifier) => `require(${add(resolveImport(specifier, path))})`);
  modules[id] = source; return id;
}
const entry = add(resolve(directory, "main.tsx"));
const js = `(function(){"use strict";const modules=[${modules.map(source => `function(module,exports,require){\n${source}\n}`).join(",\n")}];const cache={};function require(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};modules[id](module,module.exports,require);return module.exports;}require(${entry});})();`;
if (/\bfetch\(/.test(js) || /\bXMLHttpRequest\b|\bWebSocket\b/.test(js)) throw Error("Preview must not contain network calls");
const html = readFileSync(resolve(directory, "shell.html"), "utf8").replace("/*__PREVIEW_CSS__*/", () => cssParts.join("\n")).replace("/*__PREVIEW_JS__*/", () => js.replace(/<\/script/gi, "<\\/script"));
const output = resolve(directory, "../../account-performance-preview.html");
if (Buffer.byteLength(html) > 1000000) throw Error("Preview exceeds size limit");
writeFileSync(output, html);
writeFileSync(resolve(directory, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>账户表现 · 交互验收</title><style>body{margin:0;padding:20px;background:#080f16}main{max-width:1320px;margin:auto}@media(max-width:640px){body{padding:0}}</style></head><body><main>${html}</main></body></html>`);
console.log(JSON.stringify({ path: output, bytes: Buffer.byteLength(html), modules: modules.length, adapter: "in-memory", source: "actual AccountPerformance component" }));
