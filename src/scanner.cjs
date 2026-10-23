const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { FileParser } = require("./parse-worker-client.cjs");
const TEXT = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".svg",
  ".md",
  ".txt",
  ".xml",
  ".vue",
  ".svelte",
  ".scss",
  ".sass",
  ".less",
  ".yaml",
  ".yml",
  ".php",
  ".astro",
]);
const FLUFF = new Set([
  ".map",
  ".zip",
  ".7z",
  ".rar",
  ".tar",
  ".gz",
  ".exe",
  ".msi",
  ".dmg",
  ".iso",
]);
const MEDIA = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".m4v",
]);
const SKIP = new Set([
  ".git",
  "node_modules",
  ".next",
  ".cache",
  ".svn",
  ".venv",
  "vendor",
]);
const PRIVATE =
  /(^|\/)(\.env(?:\..*)?|\.npmrc|\.netrc|id_rsa|id_ed25519|credentials|secrets?)(\/|$)|\.(pem|key|p12|pfx)$/i;
const inside = (a, b) => {
  const r = path.relative(a, b);
  return (
    r === "" ||
    (!r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r))
  );
};
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function layoutOutline(nodes, depth = 0) {
  return nodes
    .map(
      (n) =>
        "  ".repeat(depth) +
        n.tag +
        (n.id ? "#" + n.id : "") +
        (n.classes?.length ? "." + n.classes.join(".") : "") +
        "\n" +
        layoutOutline(n.children, depth + 1),
    )
    .join("");
}
async function scan(root, options = {}, progress = () => {}) {
  root = await fs.realpath(root);
  if (!(await fs.stat(root)).isDirectory()) throw Error("Select a directory.");
  const threshold = options.threshold ?? 5 * 1024 * 1024;
  const result = {
    schemaVersion: 1,
    name: path.basename(root),
    createdAt: new Date().toISOString(),
    threshold,
    files: [],
    pages: [],
    languages: {},
    frameworks: [],
    skipped: [],
    warnings: [],
    totalBytes: 0,
    retainedBytes: 0,
    root,
  };
  const parser = new FileParser({
    signal: options.signal,
    timeoutMs: options.parseTimeoutMs ?? 3000,
  });
  let lastProgress = 0,
    latestProgress;
  const heartbeat = setInterval(() => {
    if (latestProgress)
      progress({
        ...latestProgress,
        files: result.files.length,
        bytes: result.totalBytes,
      });
  }, 250);
  heartbeat.unref();
  function reportProgress(phase, currentPath, force = false) {
    latestProgress = {
      files: result.files.length,
      bytes: result.totalBytes,
      phase,
      currentPath,
    };
    const now = Date.now();
    if (force || now - lastProgress >= 150) {
      lastProgress = now;
      progress({
        files: result.files.length,
        bytes: result.totalBytes,
        phase,
        currentPath,
      });
    }
  }
  async function walk(dir) {
    options.signal?.throwIfAborted();
    reportProgress("reading-directory", path.relative(root, dir) || ".");
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      options.signal?.throwIfAborted();
      const abs = path.join(dir, entry.name),
        rel = path.relative(root, abs).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        result.skipped.push({
          path: rel,
          reason: "Symbolic link (not followed)",
        });
        continue;
      }
      if (options.httrack && require("./httrack-import.cjs").excluded(rel)) {
        result.skipped.push({
          path: rel,
          reason: "HTTrack cache, log, or configuration",
        });
        continue;
      }
      if (PRIVATE.test(rel)) {
        result.skipped.push({ path: rel, reason: "Potential credential file" });
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name))
          result.skipped.push({
            path: rel,
            reason: "Dependency, cache, or version control directory",
          });
        else
          try {
            await walk(abs);
          } catch (error) {
            if (options.signal?.aborted) throw error;
            result.warnings.push(`Directory skipped ${rel}: ${error.message}`);
          }
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const st = await fs.stat(abs),
          ext = path.extname(rel).toLowerCase();
        const heavy =
          FLUFF.has(ext) ||
          MEDIA.has(ext) ||
          (!TEXT.has(ext) && st.size > threshold);
        const file = {
          path: rel,
          extension: ext || "(none)",
          bytes: st.size,
          modifiedMs: st.mtimeMs,
          decision: heavy ? "omit" : "keep",
          reason: FLUFF.has(ext)
            ? "Archive, installer, or source map (not needed for website rendering)"
            : MEDIA.has(ext)
              ? "Video or audio"
              : heavy
                ? "Large binary asset"
                : "Source or supporting asset",
          references: [],
        };
        result.totalBytes += st.size;
        if (!heavy) result.retainedBytes += st.size;
        result.languages[file.extension] =
          (result.languages[file.extension] || 0) + 1;
        reportProgress("inventory", rel);
        if (TEXT.has(ext) && st.size <= 2 * 1024 * 1024) {
          try {
            reportProgress("parsing-source", rel);
            const buffer = await fs.readFile(abs, { signal: options.signal });
            file.sha256 = crypto
              .createHash("sha256")
              .update(buffer)
              .digest("hex");
            const text = buffer.toString("utf8");
            const parsed = await parser.parse(text, ext);
            file.references = parsed.references;
            if (parsed.structure)
              result.pages.push({
                path: rel,
                ...parsed.structure,
                title: parsed.structure.title || rel,
              });
            if (path.basename(rel) === "package.json")
              try {
                const manifest = JSON.parse(text);
                file.dependencies = {
                  ...manifest.dependencies,
                  ...manifest.devDependencies,
                };
              } catch {
                result.warnings.push(`Invalid JSON: ${rel}`);
              }
          } catch (error) {
            if (options.signal?.aborted) throw error;
            result.warnings.push(
              `Source analysis skipped ${rel}: ${error.message}. File remains in the inventory and lightweight selection.`,
            );
          }
        } else if (TEXT.has(ext))
          result.warnings.push(`Source parsing skipped above 2 MiB: ${rel}`);
        result.files.push(file);
        reportProgress("inventory", rel);
      } catch (e) {
        if (options.signal?.aborted) throw e;
        result.warnings.push(`${rel}: ${e.message}`);
      }
    }
  }
  try {
    reportProgress("reading-directory", ".", true);
    await walk(root);
    reportProgress("resolving-references", ".", true);
    const deps = new Set(
      result.files.flatMap((f) => Object.keys(f.dependencies || {})),
    );
    result.frameworks = [
      "react",
      "next",
      "vue",
      "nuxt",
      "svelte",
      "@angular/core",
      "astro",
      "vite",
      "tailwindcss",
      "bootstrap",
    ].filter((x) => deps.has(x));
    const paths = new Set(result.files.map((f) => f.path));
    for (const [index, f] of result.files.entries()) {
      if (index % 100 === 0) {
        options.signal?.throwIfAborted();
        await new Promise((resolve) => setImmediate(resolve));
        reportProgress("resolving-references", f.path);
      }
      f.references = f.references.map((target) => {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target))
          return { target, kind: "external-or-anchor" };
        let clean;
        try {
          clean = decodeURIComponent(target.split(/[?#]/)[0]);
        } catch {
          clean = target.split(/[?#]/)[0];
        }
        const resolved = path.posix.normalize(
          clean.startsWith("/")
            ? clean.slice(1)
            : path.posix.join(path.posix.dirname(f.path), clean),
        );
        return {
          target,
          resolved,
          kind: paths.has(resolved) ? "local" : "unresolved",
        };
      });
    }
    result.warnings.push(
      "Layout is inferred from source, not a browser rendering. Dynamic routes, runtime requests, srcset, and bundled imports may need manual review.",
    );
    progress({ files: result.files.length, bytes: result.totalBytes });
    return result;
  } finally {
    clearInterval(heartbeat);
    await parser.close();
  }
}
function publicManifest(scan) {
  const { root, ...data } = scan;
  return data;
}
function report(s) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PageTrace report</title><style>body{font:16px system-ui;background:#ffffff;color:#143d32;max-width:1000px;margin:48px auto;padding:24px}h1,h2{color:#00674F}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #dfebe5}code{overflow-wrap:anywhere}small{color:#a6b2bf}</style></head><body><h1>${escape(s.name)} / PageTrace</h1><p>${s.files.length} files · ${s.pages.length} HTML pages · ${(s.totalBytes / 1048576).toFixed(1)} MiB scanned · ${(s.retainedBytes / 1048576).toFixed(1)} MiB selected</p>${s.import ? `<h2>Imported mirror</h2><p>${escape(s.import.tool)} · ${escape(s.import.note)}</p>` : ""}<h2>Technology</h2><p>${escape(s.frameworks.join(", ") || "No package-based framework detected")}</p><p>${escape(
    Object.entries(s.languages)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · "),
  )}</p><h2>Website relationship diagram</h2>${require("./site-schema.cjs").diagram(s)}<h2>Pages & layout clues</h2>${s.pages
    .map(
      (p) =>
        `<h3>${escape(p.title)}</h3><code>${escape(p.path)}</code><p>${escape(
          Object.entries(p.elements)
            .map(([k, v]) => `${k} × ${v}`)
            .join(" · "),
        )}</p><ul>${p.headings.map((h) => `<li>H${h.level}: ${escape(h.text)}</li>`).join("")}</ul>`,
    )
    .join(
      "",
    )}<h2>Element outlines</h2>${s.pages.map((p) => `<h3>${escape(p.path)}</h3><pre>${escape(layoutOutline(p.layout || []))}</pre>`).join("")}<h2>Asset decisions</h2><table><tr><th>File</th><th>Size</th><th>Decision</th></tr>${s.files.map((f) => `<tr><td>${escape(f.path)}</td><td>${f.bytes.toLocaleString()}</td><td>${escape(f.decision)} — ${escape(f.reason)}</td></tr>`).join("")}</table><h2>Excluded paths</h2><ul>${s.skipped.map((x) => `<li>${escape(x.path)}: ${escape(x.reason)}</li>`).join("")}</ul><h2>Limitations & warnings</h2><ul>${s.warnings.map((x) => `<li>${escape(x)}</li>`).join("")}</ul></body></html>`;
}
async function exportBundle(s, destination, progress = () => {}) {
  const source = await fs.realpath(s.root),
    parent = await fs.realpath(destination);
  if (inside(source, parent))
    throw Error("Choose an export folder outside the source website.");
  const out = await fs.mkdtemp(path.join(parent, "PageTrace-"));
  const lightweight = path.join(out, "lightweight");
  await fs.mkdir(lightweight);
  const exported = { ...publicManifest(s), exportWarnings: [] };
  await fs.writeFile(
    path.join(out, "schema.json"),
    JSON.stringify(require("./site-schema.cjs").schema(s), null, 2),
  );
  await fs.writeFile(
    path.join(out, "site-map.svg"),
    require("./site-schema.cjs").diagram(s),
  );
  let processed = 0,
    copiedBytes = 0;
  for (const file of s.files) {
    processed++;
    if (processed % 50 === 0)
      progress({ files: processed, bytes: copiedBytes });
    const from = path.join(source, file.path),
      to = path.join(lightweight, file.path);
    if (!inside(source, from) || !inside(lightweight, to))
      throw Error("Unsafe file path.");
    if (file.decision === "omit") continue;
    try {
      // Recheck links at export time; never follow a substituted symlink outside the source.
      const real = await fs.realpath(from);
      if (!inside(source, real))
        throw Error("Path now resolves outside source");
      if ((await fs.lstat(from)).isSymbolicLink())
        throw Error("File became a symbolic link");
      const st = await fs.stat(from);
      if (st.size !== file.bytes || st.mtimeMs !== file.modifiedMs)
        throw Error("File changed; rescan before exporting");
      if (file.sha256) {
        const content = await fs.readFile(from);
        if (
          crypto.createHash("sha256").update(content).digest("hex") !==
          file.sha256
        )
          throw Error("File content changed; rescan before exporting");
      }
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to, require("node:fs").constants.COPYFILE_EXCL);
      copiedBytes += file.bytes;
    } catch (e) {
      exported.exportWarnings.push(`${file.path}: ${e.message}`);
    }
  }
  const omitted = s.files.filter((f) => f.decision === "omit");
  const omittedPaths = new Set(omitted.map((f) => f.path));
  const helper = await fs.mkdtemp(path.join(lightweight, ".pagetrace-"));
  const helperName = path.basename(helper);
  exported.placeholderDirectory = "lightweight/" + helperName;
  await fs.writeFile(
    path.join(helper, "PAGETRACE-OMITTED.json"),
    JSON.stringify(omitted, null, 2),
    { flag: "wx" },
  );
  await fs.writeFile(
    path.join(helper, "PAGETRACE-PLACEHOLDER.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="#eff8f3"/><text x="50%" y="50%" fill="#00674F" text-anchor="middle" font-family="sans-serif" font-size="28">Media removed by PageTrace</text></svg>',
    { flag: "wx" },
  );
  // Rewrite explicit HTML media elements, preserving source separately in the manifest.
  for (const f of s.files.filter(
    (f) =>
      /\.html?$/i.test(f.path) &&
      f.decision === "keep" &&
      f.bytes <= 2 * 1024 * 1024,
  )) {
    const target = path.join(lightweight, f.path);
    try {
      let html = await fs.readFile(target, "utf8");
      const placeholder = path.posix.relative(
        path.posix.dirname(f.path),
        helperName + "/PAGETRACE-PLACEHOLDER.svg",
      );
      html = html.replace(
        /<(video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        `<img src="${escape(placeholder)}" alt="Media omitted by PageTrace" style="max-width:100%;height:auto">`,
      );
      for (const ref of f.references.filter(
        (r) => r.resolved && omittedPaths.has(r.resolved),
      )) {
        html = html.replace(
          /\b(src|poster)\s*=\s*(['"])(.*?)\2/gi,
          (m, attr, q, value) =>
            value === ref.target ? `${attr}=${q}${escape(placeholder)}${q}` : m,
        );
      }
      await fs.writeFile(target, html);
    } catch (e) {
      exported.exportWarnings.push(
        `HTML placeholder rewrite ${f.path}: ${e.message}`,
      );
    }
  }
  await fs.writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(exported, null, 2),
  );
  await fs.writeFile(
    path.join(out, "report.html"),
    report({ ...s, warnings: [...s.warnings, ...exported.exportWarnings] }),
  );
  await fs.writeFile(
    path.join(out, "REBUILD.md"),
    `# ${s.name}: reconstruction brief\n\nUse schema.json for the complete page/dependency graph and site-map.svg for its visual page map. Use manifest.json for file relationships, page headings, structural elements, technology clues, and asset decisions. Source is in lightweight/. Replace media using lightweight/${helperName}/PAGETRACE-OMITTED.json. HTML video/audio elements have generic image placeholders; CSS and JavaScript media references may still require editing.\n\nThis is a static source inventory, not a compiled or pixel-exact recreation. Dependencies, credentials, symlinks, and caches were excluded. Inspect exported source for proprietary content or unrecognized secrets before sharing it with an AI. Source code has not been executed or sanitized for safe execution.\n`,
  );
  progress({ files: s.files.length, bytes: copiedBytes });
  return { path: out, warnings: exported.exportWarnings };
}
module.exports = { scan, exportBundle, publicManifest, report };
