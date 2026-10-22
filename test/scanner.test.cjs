const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  scan,
  exportBundle,
  publicManifest,
  report,
} = require("../src/scanner.cjs");
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sieve-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const site = path.join(root, "site"),
    out = path.join(root, "out");
  await fs.mkdir(site);
  await fs.mkdir(out);
  return { root, site, out };
}
test("scans structure and exports source with placeholders without modifying original", async (t) => {
  const { site, out } = await fixture(t);
  await fs.mkdir(path.join(site, "styles"));
  await fs.mkdir(path.join(site, "media"));
  const html =
    '<title>Example &lt;site&gt;</title><header><nav><a href="about.html">About</a></nav></header><main><h1>Welcome</h1><video src="media/demo.mp4"></video><img src="media/huge.png"><script src="app.js"></script></main>';
  await fs.writeFile(path.join(site, "index.html"), html);
  await fs.writeFile(path.join(site, "about.html"), "<h1>About</h1>");
  await fs.writeFile(
    path.join(site, "app.js"),
    'throw new Error("MUST NOT EXECUTE");',
  );
  await fs.writeFile(
    path.join(site, "styles/main.css"),
    "body{background:url(../media/huge.png)}",
  );
  await fs.writeFile(path.join(site, "media/demo.mp4"), Buffer.alloc(4096));
  await fs.writeFile(path.join(site, "media/huge.png"), Buffer.alloc(4096));
  await fs.writeFile(
    path.join(site, "package.json"),
    JSON.stringify({ dependencies: { react: "19" } }),
  );
  const s = await scan(site, { threshold: 1024 });
  assert.equal(s.pages.length, 2);
  assert.deepEqual(s.frameworks, ["react"]);
  assert.equal(
    s.files
      .find((f) => f.path === "index.html")
      .references.find((r) => r.target === "about.html").kind,
    "local",
  );
  assert.equal(
    s.files.find((f) => f.path === "styles/main.css").references[0].resolved,
    "media/huge.png",
  );
  assert.equal(s.totalBytes - s.retainedBytes, 8192);
  assert.equal(publicManifest(s).root, undefined);
  const result = await exportBundle(s, out);
  assert.equal(result.warnings.length, 0);
  assert.equal(await fs.readFile(path.join(site, "index.html"), "utf8"), html);
  const copy = await fs.readFile(
    path.join(result.path, "lightweight/index.html"),
    "utf8",
  );
  assert(!copy.includes("<video"));
  assert(copy.includes("PAGETRACE-PLACEHOLDER.svg"));
  await assert.rejects(
    fs.stat(path.join(result.path, "lightweight/media/demo.mp4")),
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(result.path, "manifest.json")),
  );
  assert.equal(manifest.files.length, 7);
  assert.equal(manifest.root, undefined);
  await fs.access(path.join(result.path, "report.html"));
  const second = await exportBundle(s, out);
  assert.notEqual(result.path, second.path);
});
test("excludes credentials, caches, and symbolic links and rejects nested exports", async (t) => {
  const { site, out } = await fixture(t);
  await fs.writeFile(path.join(site, ".env.local"), "SECRET=never-export");
  await fs.mkdir(path.join(site, "node_modules"));
  await fs.writeFile(path.join(site, "node_modules/dependency.js"), "code");
  await fs.symlink(out, path.join(site, "linked"));
  await fs.writeFile(path.join(site, "safe.txt"), "hello");
  const s = await scan(site);
  assert.equal(s.files.length, 1);
  assert.equal(s.skipped.length, 3);
  await assert.rejects(exportBundle(s, site), /outside/);
  const exported = await exportBundle(s, out);
  await assert.rejects(
    fs.stat(path.join(exported.path, "lightweight/.env.local")),
  );
});
test("detects changed files and escapes report text", async (t) => {
  const { site, out } = await fixture(t);
  await fs.writeFile(
    path.join(site, "evil.html"),
    "<title><script>alert(1)</script></title>",
  );
  const s = await scan(site);
  assert(!report(s).includes("<script>"));
  await fs.writeFile(path.join(site, "evil.html"), "changed");
  const r = await exportBundle(s, out);
  assert(r.warnings.some((w) => w.includes("File changed")));
});
test("large binary files are not read as source and large source is retained without parsing", async (t) => {
  const { site } = await fixture(t);
  const f = await fs.open(path.join(site, "large.mp4"), "w");
  await f.truncate(2500000000);
  await f.close();
  await fs.writeFile(
    path.join(site, "large.js"),
    " ".repeat(2 * 1024 * 1024 + 1),
  );
  const s = await scan(site);
  assert.equal(s.files.find((f) => f.path === "large.mp4").decision, "omit");
  assert.equal(s.files.find((f) => f.path === "large.js").decision, "keep");
  assert(s.warnings.some((w) => w.includes("Source parsing skipped")));
  assert(s.totalBytes > 2500000000);
});
test("HTML entities and nested layout are parsed and user files never collide with generated helpers", async (t) => {
  const { site, out } = await fixture(t);
  await fs.writeFile(
    path.join(site, "index.html"),
    '<title>A &amp; B</title><main id="app"><section class="hero wide"><h1>Hello &amp; welcome</h1><p>Important content</p></section></main>',
  );
  await fs.writeFile(path.join(site, "PAGETRACE-PLACEHOLDER.svg"), "original");
  const s = await scan(site);
  assert.equal(s.pages[0].title, "A & B");
  assert.equal(s.pages[0].headings[0].text, "Hello & welcome");
  assert(s.pages[0].content.includes("Important content"));
  const layout = JSON.stringify(s.pages[0].layout);
  assert(layout.includes("hero"));
  assert(layout.includes("app"));
  const r = await exportBundle(s, out);
  assert.equal(
    await fs.readFile(
      path.join(r.path, "lightweight/PAGETRACE-PLACEHOLDER.svg"),
      "utf8",
    ),
    "original",
  );
});
test("cancelled scans stop without touching the source", async (t) => {
  const { site } = await fixture(t);
  await fs.writeFile(path.join(site, "index.html"), "<h1>Keep me</h1>");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scan(site, { signal: controller.signal }), {
    name: "AbortError",
  });
  assert.equal(
    await fs.readFile(path.join(site, "index.html"), "utf8"),
    "<h1>Keep me</h1>",
  );
});
test(
  "large valid export-heavy JavaScript finishes instead of quadratic reference matching",
  { timeout: 10000 },
  async (t) => {
    const { site } = await fixture(t);
    await fs.writeFile(
      path.join(site, "bundle.js"),
      Array.from(
        { length: 60000 },
        (_, i) => `export const item${i} = ${i}\n`,
      ).join(""),
    );
    await fs.writeFile(
      path.join(site, "index.html"),
      "<title>Still parsed</title><main><h1>Complete</h1></main>",
    );
    const phases = [];
    let ticks = 0;
    const clock = setInterval(() => ticks++, 5);
    t.after(() => clearInterval(clock));
    const result = await scan(site, {}, (p) => phases.push(p));
    assert.equal(result.files.length, 2);
    assert.equal(result.pages.length, 1);
    assert.equal(
      result.files.find((f) => f.path === "bundle.js").references.length,
      0,
    );
    assert(phases.some((p) => p.currentPath));
    assert(ticks > 0, "Parsing must leave the host event loop responsive");
  },
);
test("parser timeouts retain files and preserve byte accounting", async (t) => {
  const { site } = await fixture(t);
  const content = "<h1>Retained despite parser timeout</h1>";
  await fs.writeFile(path.join(site, "index.html"), content);
  const result = await scan(site, { parseTimeoutMs: 1 });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].decision, "keep");
  assert.equal(result.totalBytes, Buffer.byteLength(content));
  assert.equal(result.retainedBytes, result.totalBytes);
  assert(result.warnings.some((w) => w.includes("exceeded")));
});
test("worker timeouts restart the parser and cancellation interrupts stuck parsing", async (t) => {
  const { root } = await fixture(t);
  const workerPath = path.join(root, "worker.cjs");
  await fs.writeFile(
    workerPath,
    `const {parentPort}=require('node:worker_threads');parentPort.on('message',m=>{if(m.text==='stall'){while(true){}}else parentPort.postMessage({id:m.id,parsed:{references:[]}});});`,
  );
  const { FileParser } = require("../src/parse-worker-client.cjs");
  const parser = new FileParser({ workerPath, timeoutMs: 200 });
  t.after(() => parser.close());
  await assert.rejects(parser.parse("stall", ".js"), { code: "PARSE_TIMEOUT" });
  assert.deepEqual(await parser.parse("ready", ".js"), { references: [] });
  const controller = new AbortController();
  const cancelled = new FileParser({
    workerPath,
    signal: controller.signal,
    timeoutMs: 5000,
  });
  t.after(() => cancelled.close());
  const running = cancelled.parse("stall", ".js");
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
});
test("static references cover imports, re-exports, dynamic imports, attributes, and CSS", async (t) => {
  const { site } = await fixture(t);
  await fs.writeFile(
    path.join(site, "entry.js"),
    `import Thing from './default.js';import {x} from './named.js';export {y} from './shared.js';import './side.css';import('./lazy.js');require('./legacy.cjs');export const n=1;`,
  );
  await fs.writeFile(
    path.join(site, "style.css"),
    `@import './base.css'; .hero{background:url('./cover.png')}`,
  );
  const result = await scan(site);
  assert.deepEqual(
    result.files
      .find((f) => f.path === "entry.js")
      .references.map((r) => r.target)
      .sort(),
    [
      "./default.js",
      "./named.js",
      "./shared.js",
      "./side.css",
      "./lazy.js",
      "./legacy.cjs",
    ].sort(),
  );
  assert.equal(
    result.files.find((f) => f.path === "style.css").references.length,
    2,
  );
});
