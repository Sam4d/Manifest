// Capture engine shared by the desktop and CLI. Remote source is never executed here.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const AGENT = "PageTrace/0.4 (+public website capture)";
const hash = (s) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 20);
const abort = (signal) => signal?.throwIfAborted();
function htmlNodes(document) {
  const result = [],
    pending = [document];
  while (pending.length) {
    const node = pending.pop();
    result.push(node);
    if (node.content) pending.push(node.content);
    for (const child of (node.childNodes || []).toReversed())
      pending.push(child);
  }
  return result;
}
function urlOf(value, base) {
  try {
    const u = new URL(value, base);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
function options(input = {}) {
  const out = {
    mode: "static",
    httrackFull: false,
    maxPages: 100,
    maxFiles: 2000,
    maxDepth: 3,
    maxBytes: 500 * 1048576,
    maxFileBytes: 50 * 1048576,
    delayMs: 250,
    timeoutMs: 30000,
    retries: 2,
    externalAssets: true,
    include: "",
    exclude: "",
    ...input,
  };
  for (const [key, min, max] of [
    ["maxPages", 1, 10000],
    ["maxFiles", 1, 100000],
    ["maxDepth", 0, 30],
    ["maxBytes", 1024, 20 * 1073741824],
    ["maxFileBytes", 1024, 2 * 1073741824],
    ["delayMs", 0, 60000],
    ["timeoutMs", 100, 120000],
    ["retries", 0, 5],
  ]) {
    if (!Number.isSafeInteger(out[key]) || out[key] < min || out[key] > max)
      throw Error(`Invalid ${key} (${min}–${max}).`);
  }
  if (!["static", "browser", "httrack"].includes(out.mode))
    throw Error("Choose HTTrack, static or browser capture.");
  if (typeof out.httrackFull !== "boolean")
    throw Error("Invalid HTTrack full-mirror setting.");
  if (typeof out.externalAssets !== "boolean")
    throw Error("Invalid external asset setting.");
  for (const key of ["include", "exclude"])
    if (typeof out[key] !== "string" || out[key].length > 2000)
      throw Error("Invalid URL filters.");
  return out;
}
const patterns = (value) =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
function matchPattern(url, pattern) {
  return new RegExp(
    pattern
      .split("*")
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*"),
  ).test(url);
}
function allowed(url, opts) {
  return (
    !patterns(opts.exclude).some((p) => matchPattern(url, p)) &&
    (!opts.include.trim() ||
      patterns(opts.include).some((p) => matchPattern(url, p)))
  );
}
// Robots groups use longest matching path and Allow wins a tie. PageTrace-specific groups override *.
function robotsRules(source) {
  const groups = [];
  let group = null,
    hasRules = false;
  for (const line of source.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, "").match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1].toLowerCase(),
      value = m[2];
    if (key === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key)) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", value });
    }
  }
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && "pagetrace".includes(a)),
  );
  return (
    specific.length ? specific : groups.filter((g) => g.agents.includes("*"))
  ).flatMap((g) => g.rules);
}
function robotsAllowed(url, rules) {
  const u = new URL(url),
    target = u.pathname + u.search;
  const matches = rules
    .filter((r) => {
      const end = r.value.endsWith("$");
      const value = end ? r.value.slice(0, -1) : r.value;
      const re = value
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp("^" + re + (end ? "$" : "")).test(target);
    })
    .sort(
      (a, b) =>
        b.value.replace(/[*$]/g, "").length -
          a.value.replace(/[*$]/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return !matches.length || matches[0].allow;
}
async function discover(source, mime, base) {
  const refs = [];
  const add = (raw, page = false) => {
    const url = urlOf(raw, base);
    if (url) refs.push({ url, page });
  };
  if (/html/i.test(mime)) {
    const { parse } = await import("parse5");
    const doc = parse(source);
    const nodes = htmlNodes(doc);
    const baseNode = nodes.find((n) => n.tagName === "base");
    base =
      urlOf(baseNode?.attrs?.find((a) => a.name === "href")?.value, base) ||
      base;
    for (const n of nodes) {
      const attrs = Object.fromEntries(
        (n.attrs || []).map((a) => [a.name, a.value]),
      );
      for (const key of ["src", "href", "poster", "data-src", "data-href"]) {
        if (
          attrs[key] &&
          !(key === "href" && ["base", "form"].includes(n.tagName))
        )
          add(attrs[key], ["a", "area", "iframe"].includes(n.tagName));
      }
      if (n.tagName === "object" && attrs.data) add(attrs.data);
      for (const value of [attrs.srcset, attrs["data-srcset"]])
        if (value && !value.includes("data:"))
          for (const item of value.split(",")) add(item.trim().split(/\s+/)[0]);
      if (attrs.style)
        refs.push(...(await discover(attrs.style, "text/css", base)));
      if (n.tagName === "style")
        refs.push(
          ...(await discover(
            (n.childNodes || []).map((c) => c.value || "").join(""),
            "text/css",
            base,
          )),
        );
    }
  } else if (/css/i.test(mime)) {
    for (const re of [
      /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi,
      /@import\s+['"]([^'"]+)/gi,
    ])
      for (const m of source.matchAll(re)) add(m[1]);
  } else if (/javascript/i.test(mime)) {
    for (const re of [
      /(?:import|export)\s+(?:[^'";]*?from\s*)?['"]([^'"]+)['"]/g,
      /import\(\s*['"]([^'"]+)['"]\s*\)/g,
      /new URL\(\s*['"]([^'"]+)['"]/g,
    ])
      for (const m of source.matchAll(re))
        if (/^(\.|\/|https?:)/.test(m[1])) add(m[1]);
  } else if (/xml/i.test(mime)) {
    for (const m of source.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi))
      add(m[1].replace(/&amp;/g, "&"), !/sitemap.*\.xml/i.test(m[1]));
  } else if (/manifest\+json/i.test(mime)) {
    try {
      for (const icon of JSON.parse(source).icons || []) add(icon.src);
    } catch {}
  }
  return [...new Map(refs.map((r) => [r.url, r])).values()];
}
function fileFor(url, mime) {
  const ext = /html/i.test(mime)
    ? ".html"
    : /css/i.test(mime)
      ? ".css"
      : /javascript/i.test(mime)
        ? ".js"
        : path.posix
            .extname(new URL(url).pathname)
            .match(/^\.[a-z0-9]{1,8}$/i)?.[0] || ".bin";
  const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_").slice(0, 80);
  return `files/${host}/${hash(url)}${ext}`;
}
async function saveJSON(file, value) {
  await fs.writeFile(file + ".tmp", JSON.stringify(value, null, 2));
  await fs.rename(file + ".tmp", file);
}
async function request(url, opts, signal, acceptRedirect, onResponse) {
  for (let attempt = 0; ; attempt++) {
    abort(signal);
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      let target = url;
      for (let hops = 0; hops < 11; hops++) {
        const response = await fetch(target, {
          signal: combined,
          redirect: "manual",
          headers: { "User-Agent": AGENT },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const next = urlOf(response.headers.get("location"), target);
          if (!next || !(await acceptRedirect(next)))
            throw Error("Redirect outside allowed scope or robots policy.");
          target = next;
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          const error = Error(`HTTP ${response.status}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        return await onResponse(response, target);
      }
      throw Error("Too many redirects.");
    } catch (e) {
      abort(signal);
      if (
        attempt >= opts.retries ||
        e.retryable === false ||
        /scope|robots|limit|redirect/i.test(e.message)
      )
        throw e;
      await new Promise((resolve, reject) => {
        const done = () => {
          signal?.removeEventListener("abort", cancel);
          resolve();
        };
        const timer = setTimeout(done, Math.min(5000, 300 * 2 ** attempt));
        function cancel() {
          clearTimeout(timer);
          reject(signal.reason);
        }
        signal?.addEventListener("abort", cancel, { once: true });
      });
    }
  }
}
async function captureSite(
  seed,
  directory,
  input,
  { signal, progress = () => {}, render } = {},
  resume = false,
) {
  const opts = options(input);
  seed = urlOf(seed);
  if (!seed) throw Error("Enter an HTTP(S) website URL.");
  if (opts.mode === "browser" && !render)
    throw Error("Browser capture requires the desktop app.");
  await fs.mkdir(directory, { recursive: true });
  const stateFile = path.join(directory, "capture.json");
  const state = resume
    ? JSON.parse(await fs.readFile(stateFile, "utf8"))
    : {
        version: 1,
        seed,
        options: opts,
        status: "running",
        bytes: 0,
        pages: 0,
        records: [],
        queue: [{ url: seed, page: true, depth: 0 }],
        createdAt: new Date().toISOString(),
      };
  if (
    state.version !== 1 ||
    state.seed !== seed ||
    JSON.stringify(state.options) !== JSON.stringify(opts)
  )
    throw Error("Capture settings do not match saved job.");
  if (
    !Array.isArray(state.records) ||
    !Array.isArray(state.queue) ||
    state.records.length + state.queue.length > opts.maxFiles
  )
    throw Error("Invalid saved capture.");
  for (const item of [...state.records, ...state.queue]) {
    if (
      !urlOf(item.url) ||
      !Number.isInteger(item.depth) ||
      item.depth < 0 ||
      typeof item.page !== "boolean"
    )
      throw Error("Invalid saved URL record.");
    if (
      item.status === "saved" &&
      (item.file !== fileFor(item.url, item.mime) ||
        !Number.isSafeInteger(item.bytes) ||
        item.bytes < 0 ||
        (item.renderedFile &&
          item.renderedFile !== "rendered/" + hash(item.url) + ".html"))
    )
      throw Error("Invalid saved file record.");
  }
  const original = path.join(directory, "original"),
    mirror = path.join(directory, "mirror");
  await fs.mkdir(original, { recursive: true });
  await fs.mkdir(mirror, { recursive: true });
  const seen = new Set([
    ...state.records.map((r) => r.url),
    ...state.queue.map((r) => r.url),
  ]);
  const origin = new URL(seed).origin,
    policies = new Map();
  async function policy(url) {
    const host = new URL(url).origin;
    if (policies.has(host)) return policies.get(host);
    // A robots redirect may only stay on its own origin; policy retrieval cannot recurse.
    const rules = await request(
      host + "/robots.txt",
      opts,
      signal,
      async (next) => new URL(next).origin === host,
      async (r) => {
        let body = "";
        for await (const chunk of r.body) {
          body += Buffer.from(chunk).toString();
          if (body.length > 1048576) throw Error("Robots file exceeds limit.");
        }
        return robotsRules(body);
      },
    ).catch((e) => {
      abort(signal);
      if (/HTTP 404|HTTP 410/.test(e.message)) return [];
      throw Error(`Could not verify robots.txt for ${host}: ${e.message}`);
    });
    policies.set(host, rules);
    return rules;
  }
  async function permitted(url, page = false) {
    if (!allowed(url, opts)) return false;
    if (new URL(url).origin !== origin && (page || !opts.externalAssets))
      return false;
    return robotsAllowed(url, await policy(url));
  }
  function enqueue(ref, depth) {
    if (seen.has(ref.url)) return;
    if (state.queue.length + state.records.length >= opts.maxFiles) {
      state.truncatedDiscovery = (state.truncatedDiscovery || 0) + 1;
      return;
    }
    if (
      ref.page &&
      (depth > opts.maxDepth || new URL(ref.url).origin !== origin)
    )
      return;
    if (
      !allowed(ref.url, opts) ||
      (!ref.page && !opts.externalAssets && new URL(ref.url).origin !== origin)
    )
      return;
    seen.add(ref.url);
    state.queue.push({ ...ref, depth });
  }
  async function checkpoint() {
    state.updatedAt = new Date().toISOString();
    await saveJSON(stateFile, state);
  }
  try {
    state.status = "running";
    await checkpoint();
    // robots and sitemap are retained as source metadata when available.
    if (!resume) {
      enqueue({ url: origin + "/robots.txt", page: false }, 0);
      enqueue({ url: origin + "/sitemap.xml", page: false }, 0);
    }
    while (state.queue.length) {
      abort(signal);
      if (
        state.bytes >= opts.maxBytes ||
        state.records.filter((r) => r.status === "saved").length >=
          opts.maxFiles
      ) {
        state.status = "limited";
        break;
      }
      const item = state.queue[0];
      if (item.page && state.pages >= opts.maxPages) {
        state.records.push({
          ...item,
          status: "skipped",
          reason: "Page limit",
        });
        state.queue.shift();
        continue;
      }
      progress({
        phase: "capture",
        url: item.url,
        files: state.records.filter((r) => r.status === "saved").length,
        bytes: state.bytes,
        pages: state.pages,
        queued: state.queue.length,
      });
      try {
        if (!(await permitted(item.url, item.page))) {
          state.records.push({
            ...item,
            status: "skipped",
            reason: "Robots policy or URL scope",
          });
        } else {
          const record = await request(
            item.url,
            opts,
            signal,
            (next) => permitted(next, item.page),
            async (response, finalUrl) => {
              const mime = (
                response.headers.get("content-type") ||
                "application/octet-stream"
              ).split(";")[0];
              if (/html/i.test(mime) && new URL(finalUrl).origin !== origin) {
                await response.body?.cancel();
                throw Error("External HTML outside page scope.");
              }
              if (/html/i.test(mime) && state.pages >= opts.maxPages) {
                await response.body?.cancel();
                throw Error("Page limit");
              }
              const file = fileFor(item.url, mime),
                full = path.join(original, file);
              await fs.mkdir(path.dirname(full), { recursive: true });
              const handle = await fs.open(full + ".part", "w");
              let bytes = 0;
              try {
                for await (const chunk of response.body) {
                  bytes += chunk.length;
                  if (
                    bytes > opts.maxFileBytes ||
                    state.bytes + bytes > opts.maxBytes
                  )
                    throw Error("Download byte limit");
                  await handle.writeFile(chunk);
                }
              } catch (e) {
                await handle.close();
                await fs.rm(full + ".part", { force: true });
                throw e;
              }
              await handle.close();
              await fs.rename(full + ".part", full);
              return {
                ...item,
                finalUrl,
                mime,
                file,
                bytes,
                status: "saved",
                headers: Object.fromEntries(
                  ["content-type", "etag", "last-modified", "cache-control"]
                    .map((key) => [key, response.headers.get(key)])
                    .filter(([, value]) => value),
                ),
              };
            },
          );
          state.bytes += record.bytes;
          const isHTML = /html/i.test(record.mime);
          if (isHTML) state.pages++;
          // Saved network originals remain untouched; rendered DOM is a separate snapshot.
          try {
            let source;
            if (
              /html|css|javascript|xml|manifest\+json|text\/plain/i.test(
                record.mime,
              ) &&
              record.bytes <= 8 * 1048576
            ) {
              source = await fs.readFile(
                path.join(original, record.file),
                "utf8",
              );
              if (new URL(record.finalUrl).pathname === "/robots.txt")
                for (const m of source.matchAll(
                  /^sitemap:\s*(https?:\/\/\S+)/gim,
                )) {
                  const value = urlOf(m[1]);
                  if (value) enqueue({ url: value, page: false }, 0);
                }
              if (isHTML && opts.mode === "browser") {
                try {
                  const snapshot = await render(
                    record.finalUrl,
                    signal,
                    (next) => permitted(next, false),
                  );
                  if (
                    Buffer.byteLength(snapshot.html) > opts.maxFileBytes ||
                    state.bytes + Buffer.byteLength(snapshot.html) >
                      opts.maxBytes
                  )
                    throw Error("Rendered DOM exceeds byte limit.");
                  record.renderedFile =
                    "rendered/" + hash(record.url) + ".html";
                  await fs.mkdir(path.join(directory, "rendered"), {
                    recursive: true,
                  });
                  await fs.writeFile(
                    path.join(directory, record.renderedFile),
                    snapshot.html,
                  );
                  state.bytes += Buffer.byteLength(snapshot.html);
                  source = snapshot.html;
                  for (const url of snapshot.resources) {
                    const value = urlOf(url, record.finalUrl);
                    if (value) enqueue({ url: value, page: false }, item.depth);
                  }
                } catch (e) {
                  record.renderError = e.message;
                }
              }
              for (const ref of await discover(
                source,
                record.mime,
                record.finalUrl,
              ))
                enqueue(ref, item.depth + (ref.page ? 1 : 0));
            }
          } catch (e) {
            record.discoveryError = e.message;
          }
          state.records.push(record);
        }
      } catch (e) {
        abort(signal);
        state.records.push({ ...item, status: "failed", reason: e.message });
      }
      state.queue.shift();
      await checkpoint();
      if (opts.delayMs)
        await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
    if (state.status === "running")
      state.status =
        state.truncatedDiscovery ||
        state.records.some((r) => r.reason === "Page limit")
          ? "limited"
          : state.records.some(
                (r) =>
                  r.status === "failed" ||
                  r.renderError ||
                  r.discoveryError ||
                  r.rewriteError,
              )
            ? "partial"
            : "complete";
  } catch (e) {
    state.status = signal?.aborted ? "paused" : "failed";
    state.error = e.message;
    await checkpoint();
    if (!signal?.aborted) throw e;
  }
  // Rebuild links from saved records, including on resume. Missing resources stay absolute.
  const byURL = new Map();
  for (const r of state.records.filter((r) => r.status === "saved")) {
    byURL.set(r.url, r);
    if (!byURL.has(r.finalUrl)) byURL.set(r.finalUrl, r);
  }
  for (const record of state.records.filter((r) => r.status === "saved")) {
    const dest = path.join(mirror, record.file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (
      /html|css|javascript|manifest\+json/i.test(record.mime) &&
      record.bytes <= 8 * 1048576
    ) {
      const source = await fs.readFile(
        record.renderedFile
          ? path.join(directory, record.renderedFile)
          : path.join(original, record.file),
        "utf8",
      );
      let rewritten;
      try {
        rewritten = await rewrite(
          source,
          record.mime,
          record.finalUrl,
          record.file,
          byURL,
        );
      } catch (e) {
        record.rewriteError = e.message;
        rewritten = source;
      }
      await fs.writeFile(dest, rewritten);
    } else await fs.copyFile(path.join(original, record.file), dest);
  }
  if (state.status === "complete" && state.records.some((r) => r.rewriteError))
    state.status = "partial";
  await checkpoint();
  await saveJSON(path.join(mirror, "PAGETRACE-CAPTURE.json"), {
    seed: state.seed,
    status: state.status,
    capturedAt: state.updatedAt,
    options: opts,
    limitations: [
      "Public HTTP responses only; no backend source or private databases.",
      "Browser snapshots use a bounded settling time and four scroll positions.",
      "Interactions, computed runtime URLs, authentication and server-dependent APIs may need manual reconstruction.",
      "Source parsing and link rewriting are bounded to files up to 8 MiB. Larger files are preserved.",
    ],
    records: state.records.map(
      ({
        url,
        finalUrl,
        file,
        mime,
        bytes,
        status,
        reason,
        renderError,
        discoveryError,
        rewriteError,
      }) => ({
        url,
        finalUrl,
        file,
        mime,
        bytes,
        status,
        reason,
        renderError,
        discoveryError,
        rewriteError,
      }),
    ),
    remainingURLs: state.queue.length,
    truncatedDiscovery: state.truncatedDiscovery || 0,
  });
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  await fs.writeFile(
    path.join(directory, "capture-report.html"),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PageTrace capture report</title><style>body{font:15px system-ui;max-width:1200px;margin:40px auto;padding:20px;color:#12392d}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:12px;text-align:left;overflow-wrap:anywhere}td:first-child{max-width:500px}code{font-size:12px}h1{color:#00674f}</style><h1>PageTrace capture report</h1><p>${escape(state.seed)}</p><p>Status: <b>${escape(state.status)}</b> · ${state.pages} pages · ${state.bytes} stored bytes · ${state.queue.length} queued URLs · ${state.truncatedDiscovery || 0} discoveries beyond the file limit</p><p>Full responses are in original/. Rendered DOM snapshots are in rendered/. Analyze mirror/ for an AI export. This is a bounded public-site capture; unavailable resources and server behavior may require manual reconstruction.</p><table><thead><tr><th>Source URL</th><th>Status</th><th>Local mirror file / reason</th></tr></thead><tbody>${state.records.map((r) => `<tr><td>${escape(r.url)}</td><td>${escape(r.status)}</td><td>${r.file ? `<a href="mirror/${escape(r.file)}"><code>${escape(r.file)}</code></a>` : ""}${escape(r.reason || r.renderError || r.discoveryError || r.rewriteError || "")}</td></tr>`).join("")}</tbody></table>`,
  );
  await fs.writeFile(
    path.join(directory, "README.txt"),
    `PageTrace capture: ${state.seed}\nStatus: ${state.status}\noriginal/: fetched responses\nrendered/: browser DOM snapshots, when enabled\nmirror/: locally rewritten HTML/CSS/JS for analysis\ncapture.json: URL-to-file mapping, failures, limits and resumable queue\nRemote JavaScript can still need a server. Backend code, private data and all interactions are not captured.\n`,
  );
  return { directory, mirror, state };
}
async function rewrite(source, mime, base, file, records) {
  const link = (raw) => {
    if (
      !raw ||
      raw.startsWith("#") ||
      /^(data:|mailto:|tel:|javascript:)/i.test(raw)
    )
      return raw;
    const u = urlOf(raw, base);
    if (!u) return raw;
    const r = records.get(u);
    const fragment = new URL(raw, base).hash;
    let result = r ? path.posix.relative(path.posix.dirname(file), r.file) : u;
    if (r && !result) result = path.posix.basename(file);
    return result + fragment;
  };
  const css = (value) =>
    value
      .replace(
        /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,
        (_, q, u) => `url("${link(u)}")`,
      )
      .replace(
        /(@import\s+)(['"])([^'"]+)\2/gi,
        (_, p, q, u) => p + q + link(u) + q,
      );
  if (/css/i.test(mime)) return css(source);
  const moduleLink = (raw) => {
    const mapped = link(raw);
    return /^[a-z0-9_-]/i.test(mapped) && !/^https?:/.test(mapped)
      ? "./" + mapped
      : mapped;
  };
  if (/javascript/i.test(mime))
    return source
      .replace(
        /((?:import|export)\s+(?:[^'";]*?from\s*)?)(['"])([^'"]+)\2/g,
        (_, prefix, q, u) =>
          prefix + q + (/^(\.|\/|https?:)/.test(u) ? moduleLink(u) : u) + q,
      )
      .replace(
        /((?:import|new URL)\(\s*)(['"])([^'"]+)\2/g,
        (_, prefix, q, u) =>
          prefix + q + (/^(\.|\/|https?:)/.test(u) ? moduleLink(u) : u) + q,
      );
  if (/manifest\+json/i.test(mime)) {
    try {
      const data = JSON.parse(source);
      for (const icon of data.icons || []) icon.src = link(icon.src);
      return JSON.stringify(data, null, 2);
    } catch {
      return source;
    }
  }
  const { parse, serialize } = await import("parse5"),
    doc = parse(source);
  const nodes = htmlNodes(doc);
  const baseNode = nodes.find((n) => n.tagName === "base");
  base =
    urlOf(baseNode?.attrs?.find((a) => a.name === "href")?.value, base) || base;
  for (const n of nodes) {
    if (n.tagName === "base") {
      n.parentNode.childNodes = n.parentNode.childNodes.filter((c) => c !== n);
      continue;
    }
    for (const a of n.attrs || []) {
      if (
        ["href", "src", "poster", "data-src", "data-href"].includes(a.name) ||
        (n.tagName === "object" && a.name === "data")
      )
        a.value = link(a.value);
      if (
        ["srcset", "data-srcset"].includes(a.name) &&
        !a.value.includes("data:")
      )
        a.value = a.value
          .split(",")
          .map((s) => {
            const [u, ...rest] = s.trim().split(/\s+/);
            return [link(u), ...rest].join(" ");
          })
          .join(", ");
      if (a.name === "style") a.value = css(a.value);
    }
    if (n.tagName === "style")
      for (const c of n.childNodes || []) if (c.value) c.value = css(c.value);
    // Mirrored files have new bytes; original integrity digests no longer apply.
    if (n.attrs) n.attrs = n.attrs.filter((a) => a.name !== "integrity");
  }
  return serialize(doc);
}
module.exports = {
  captureSite,
  options,
  urlOf,
  discover,
  rewrite,
  robotsRules,
  robotsAllowed,
};
