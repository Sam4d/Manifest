const $ = (id) => document.getElementById(id);
let data = null,
  operation = null,
  activeView = "overview";
const NS = "http://www.w3.org/2000/svg";
const palette = ["#00674F", "#77bfa6", "#42a387", "#b6d3c8"];
const categories = ["Source code", "Images", "Video & audio", "Other assets"];
const titles = {
  overview: [
    "See the website.",
    "Not the baggage.",
    "A clear map of your website’s pages, code, and content. Ready for your next idea.",
  ],
  pages: [
    "Every page.",
    "A clearer picture.",
    "Explore headings, semantic elements, and the source structure behind each page.",
  ],
  files: [
    "Meet the files.",
    "Keep what matters.",
    "Understand each export decision and see how your files connect.",
  ],
  insights: [
    "Under the hood.",
    "Out in the open.",
    "Understand the technologies, file types, and limits of your scan.",
  ],
  guide: [
    "A fresh start.",
    "In three steps.",
    "A practical guide to turning a local website folder into your next project.",
  ],
};
function icon(name) {
  const svg = document.createElementNS(NS, "svg"),
    use = document.createElementNS(NS, "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}
function text(tag, value, cls) {
  const e = document.createElement(tag);
  e.textContent = value;
  if (cls) e.className = cls;
  return e;
}
function size(n) {
  return n >= 1073741824
    ? (n / 1073741824).toFixed(2) + " GB"
    : n >= 1048576
      ? (n / 1048576).toFixed(1) + " MB"
      : n >= 1024
        ? (n / 1024).toFixed(1) + " KB"
        : n + " B";
}
function metric(id, n) {
  const [value, unit] = size(n).split(" ");
  $(id).replaceChildren(document.createTextNode(value), text("span", unit));
}
function message(value, kind = "success") {
  $("message").textContent = value;
  $("message").className = "notice " + kind;
  $("message").hidden = !value;
}
function navigate(view) {
  activeView = view;
  $("capture-card").hidden = view !== "overview";
  document.querySelectorAll(".nav").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  });
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== view));
  const [first, second, description] = titles[view];
  $("view-title").replaceChildren(
    document.createTextNode(first + " "),
    text("span", second),
  );
  $("view-description").textContent = description;
  $("breadcrumb").textContent = {
    overview: "Overview",
    pages: "Pages & structure",
    files: "Files & assets",
    insights: "Technology & notes",
    guide: "How to use PageTrace",
  }[view];
}
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.view)));
$("help").onclick = () => navigate("guide");
$("all-pages").onclick = () => navigate("pages");
function setBusy(value) {
  operation = value;
  document
    .querySelectorAll(
      "#capture-form input, #capture-form select, #capture-form textarea, #capture-form button, #capture-sites button, #resume-capture, #open-capture, #httrack-full",
    )
    .forEach((e) => (e.disabled = !!value || e.dataset.unavailable === "true"));
  $("scan").disabled = !!value;
  $("sample").disabled = !!value;
  $("import-httrack").disabled = !!value;
  $("export").disabled = !!value || !data;
  $("threshold").disabled = !!value;
  $("open-export").disabled = !!value;
  $("progress-panel").hidden = !value;
  $("cancel").hidden = value === "export";
  $("cancel").textContent =
    value === "capture" ? "Pause capture" : "Cancel scan";
  $("progress-title").textContent =
    value === "capture"
      ? "Capturing your websites…"
      : value === "export"
        ? "Preparing your reconstruction kit…"
        : "Reading your website…";
  $("progress-detail").textContent =
    value === "export"
      ? "Copying retained files into a new folder. Your original stays untouched."
      : "Building an inventory. Large media files are measured, never loaded.";
  $("scan").querySelector("span").textContent = data
    ? "Choose another folder"
    : "Choose website folder";
}
function empty(container, title, body) {
  container.replaceChildren();
  const e = text("div", "", "empty-state");
  e.append(icon("folder"), text("strong", title), text("div", body));
  container.append(e);
}
function renderLegend() {
  const bytes = [0, 0, 0, 0];
  if (data)
    data.files.forEach((f) => {
      const i =
        /^\.(html?|css|[cm]?js|jsx|tsx?|json|vue|svelte|scss|md|astro)$/.test(
          f.extension,
        )
          ? 0
          : /^\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(f.extension)
            ? 1
            : /^\.(mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|m4v)$/.test(
                  f.extension,
                )
              ? 2
              : 3;
      bytes[i] += f.bytes;
    });
  $("legend").replaceChildren();
  let offset = 0;
  const stops = [];
  categories.forEach((name, i) => {
    const percentage = data?.totalBytes
      ? (bytes[i] / data.totalBytes) * 100
      : 0;
    const row = text("div", "", "legend-row"),
      dot = document.createElement("i");
    dot.style.background = palette[i];
    row.append(
      dot,
      text("span", name),
      text("strong", data ? size(bytes[i]) : "—"),
      text("small", data ? Math.round(percentage) + "%" : ""),
    );
    $("legend").append(row);
    stops.push(`${palette[i]} ${offset}% ${offset + percentage}%`);
    offset += percentage;
  });
  $("donut").classList.toggle("empty-donut", !data?.totalBytes);
  $("donut").style.background = data?.totalBytes
    ? `conic-gradient(${stops.join(",")})`
    : "";
  $("donut-value").textContent = data ? size(data.totalBytes) : "—";
}
function outline(nodes, depth = 0) {
  return nodes
    .map(
      (n) =>
        "  ".repeat(depth) +
        n.tag +
        (n.id ? "#" + n.id : "") +
        (n.classes?.length ? "." + n.classes.join(".") : "") +
        "\n" +
        outline(n.children, depth + 1),
    )
    .join("");
}
function renderPages() {
  if (!data?.pages.length) {
    empty(
      $("page-list"),
      data ? "No static HTML pages found" : "Your pages will appear here",
      data
        ? "Component source is still included in the manifest. Dynamic routes are not rendered."
        : "Choose a website folder to uncover its page structure.",
    );
    return;
  }
  $("page-list").replaceChildren(
    ...data.pages.slice(0, 200).map((p) => {
      const card = text("article", "", "page-card");
      const top = text("div", "", "page-card-top");
      top.append(icon("file"), text("span", p.headings.length + " HEADINGS"));
      card.append(top, text("h2", p.title), text("code", p.path));
      const tags = text("div", "", "element-tags");
      Object.entries(p.elements).forEach(([tag, count]) =>
        tags.append(text("span", tag + " × " + count, "element-tag")),
      );
      card.append(tags);
      const list = document.createElement("ul");
      p.headings
        .slice(0, 8)
        .forEach((h) => list.append(text("li", `H${h.level}  ${h.text}`)));
      card.append(list);
      if (p.headings.length > 8)
        card.append(
          text("p", `${p.headings.length - 8} more headings in the manifest.`),
        );
      const detail = document.createElement("details");
      detail.append(
        text("summary", "Explore element outline"),
        text("pre", outline(p.layout || [])),
      );
      card.append(detail);
      if (p.layoutTruncated)
        card.append(text("p", "Large layout: outline truncated."));
      return card;
    }),
  );
  if (data.pages.length > 200)
    $("page-list").append(
      text(
        "p",
        "Showing the first 200 pages. All pages are in the manifest.",
        "footnote",
      ),
    );
}
function render() {
  $("project-name").textContent = data.name;
  $("project-meta").textContent =
    `${data.files.length.toLocaleString()} files inspected · ${data.skipped.length} paths excluded · scanned ${new Date(data.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  $("project-state").textContent = "SCAN COMPLETE";
  $("project-state").className = "badge success";
  metric("total", data.totalBytes);
  metric("retained", data.retainedBytes);
  $("reduction").replaceChildren(
    document.createTextNode(
      Math.min(
        99.9,
        data.totalBytes ? 100 * (1 - data.retainedBytes / data.totalBytes) : 0,
      ).toFixed(1),
    ),
    text("span", "%"),
  );
  $("pages-count").textContent = data.pages.length;
  $("file-count").textContent =
    data.files.length.toLocaleString() + " files inventoried";
  $("omitted").textContent =
    data.files.filter((f) => f.decision === "omit").length +
    " heavy assets left behind";
  $("nav-pages").textContent = data.pages.length;
  $("nav-files").textContent = data.files.length.toLocaleString();
  renderLegend();
  renderPages();
  renderFiles();
  $("frameworks").replaceChildren();
  if (!data.frameworks.length)
    $("frameworks").append(
      text("span", "No package-based framework detected."),
    );
  else
    data.frameworks.forEach((f) =>
      $("frameworks").append(text("span", f, "tag")),
    );
  $("technology").replaceChildren(
    ...Object.entries(data.languages)
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => {
        const row = text("div", "", "language-row"),
          track = text("div", "", "language-track"),
          fill = document.createElement("span");
        fill.style.width = (count / Math.max(1, data.files.length)) * 100 + "%";
        track.append(fill);
        row.append(text("code", ext), track, text("span", count));
        return row;
      }),
  );
  $("warnings").replaceChildren(
    ...data.warnings.slice(0, 200).map((w) => text("li", w)),
  );
  $("skipped").replaceChildren(
    ...data.skipped
      .slice(0, 200)
      .map((s) => text("li", `${s.path} — ${s.reason}`)),
  );
  if (!data.skipped.length)
    $("skipped").append(text("li", "No excluded paths."));
  if (data.skipped.length > 200)
    $("skipped").append(
      text(
        "li",
        "Showing 200 exclusions. The manifest contains the full list.",
      ),
    );
  $("recent-pages").hidden = !data.pages.length;
  $("page-preview").replaceChildren(
    ...data.pages.slice(0, 3).map((p) => {
      const row = text("div", "", "page-preview-row"),
        info = document.createElement("div");
      info.append(text("strong", p.title), text("code", p.path));
      row.append(
        icon("file"),
        info,
        text("span", p.headings.length + " headings"),
      );
      return row;
    }),
  );
  $("step-one").classList.add("complete");
  $("step-two").classList.add("active");
  $("footer-status").textContent =
    "Scan complete. Your blueprint is ready to export.";
}
function renderFiles() {
  if (!data) {
    $("files-empty").hidden = false;
    $("files-empty").textContent =
      "Choose a website folder to build your file inventory.";
    return;
  }
  const query = $("search").value.toLowerCase(),
    decision = $("decision-filter").value,
    files = data.files.filter(
      (f) =>
        f.path.toLowerCase().includes(query) &&
        (decision === "all" || f.decision === decision),
    );
  files.sort((a, b) =>
    $("file-sort").value === "largest"
      ? b.bytes - a.bytes
      : $("file-sort").value === "smallest"
        ? a.bytes - b.bytes
        : a.path.localeCompare(b.path),
  );
  $("file-list").replaceChildren(
    ...files.slice(0, 500).map((f) => {
      const row = document.createElement("tr"),
        name = text("td", ""),
        label = text("div", "", "file-name");
      label.append(
        icon(f.decision === "omit" ? "play" : "file"),
        text("span", f.path),
      );
      name.append(label);
      const status = text("td", "");
      status.append(
        text(
          "span",
          f.decision === "keep" ? "KEEP" : "OMIT",
          "badge " + f.decision,
        ),
      );
      const action = text("td", ""),
        open = text("button", "", "file-open");
      const arrow = icon("arrow");
      arrow.classList.add("diagonal");
      open.append(arrow);
      open.setAttribute("aria-label", "Inspect " + f.path);
      open.onclick = () => showFile(f);
      action.append(open);
      row.append(
        name,
        text("td", f.extension),
        text("td", size(f.bytes)),
        status,
        action,
      );
      return row;
    }),
  );
  $("files-empty").hidden = !!files.length;
  $("files-empty").textContent =
    "No files match this filter. Try another path or export decision.";
  $("file-limit").textContent =
    `Showing ${Math.min(files.length, 500).toLocaleString()} of ${files.length.toLocaleString()} matching files. Every inventoried file is included in the manifest.`;
}
function showFile(file) {
  $("detail-name").textContent = file.path;
  $("detail-meta").textContent =
    `${size(file.bytes)} · ${file.extension} · ${file.decision.toUpperCase()} — ${file.reason}`;
  $("detail-references").replaceChildren(
    ...file.references.map((ref) => {
      const row = text("div", "", "reference-row");
      row.append(
        text("div", ref.target),
        text("small", ref.kind + (ref.resolved ? " → " + ref.resolved : "")),
      );
      return row;
    }),
  );
  if (!file.references.length)
    $("detail-references").append(
      text("p", "No supported static references were found."),
    );
  $("file-dialog").showModal();
}
$("close-dialog").onclick = () => $("file-dialog").close();
$("file-dialog").onclick = (e) => {
  if (e.target === $("file-dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
};
$("search").oninput = renderFiles;
$("decision-filter").onchange = renderFiles;
async function beginScan(sample = false, httrack = false) {
  const threshold = Number($("threshold").value);
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 1000) {
    message(
      "Choose a binary cutoff between 1 and 1000 MiB, then try again.",
      "error",
    );
    $("threshold").focus();
    return;
  }
  setBusy("scan");
  message(
    sample
      ? "Preparing a local sample website. This is example content, not your files."
      : httrack
        ? "Choose a saved mirror project folder. Download caches and logs will be excluded."
        : "Choose the root folder of your extracted website.",
    "info",
  );
  try {
    const result = sample
      ? await window.pageTrace.sample(threshold)
      : httrack
        ? await window.pageTrace.importHTTrack(threshold)
        : await window.pageTrace.scan(threshold);
    if (result) {
      data = result;
      $("search").value = "";
      $("decision-filter").value = "all";
      $("open-export").hidden = true;
      $("step-three").classList.remove("complete");
      render();
      navigate("overview");
      message(
        sample
          ? "You’re exploring a sample website. Choose your own folder whenever you’re ready."
          : httrack
            ? "Saved mirror imported. Cache and logs excluded. Explore the structure, then export your lightweight blueprint."
            : "Your blueprint is ready. Explore the structure, then export to a separate folder.",
      );
    } else
      message(
        "Folder selection cancelled. Your previous scan is still available.",
        "info",
      );
  } catch (e) {
    message(
      /abort|cancel/i.test(e.message)
        ? "Scan cancelled. Your files were not changed."
        : "Couldn’t scan this folder: " + e.message,
      /abort|cancel/i.test(e.message) ? "info" : "error",
    );
  } finally {
    setBusy(null);
  }
}
$("scan").onclick = () => beginScan();
$("sample").onclick = () => beginScan(true);
$("import-httrack").onclick = () => beginScan(false, true);
$("cancel").onclick = async () => {
  try {
    await window.pageTrace.cancel();
  } catch (e) {
    message(e.message, "error");
  }
};
$("export").onclick = async () => {
  setBusy("export");
  message(
    "Choose a destination outside your source website. A new folder will be created there.",
    "info",
  );
  try {
    const result = await window.pageTrace.export();
    if (result) {
      message(
        `Exported to ${result.path}${result.warnings.length ? ` · ${result.warnings.length} export warnings. Check report.html before rebuilding.` : ". Your report, manifest, and source are ready."}`,
      );
      $("open-export").hidden = false;
      $("step-three").classList.add("complete");
      $("footer-status").textContent = result.warnings.length
        ? "Export completed with warnings. Read the report."
        : "Blueprint exported. Time to make it yours.";
    } else
      message("Export cancelled. Your scan is ready whenever you are.", "info");
  } catch (e) {
    message("Couldn’t export: " + e.message, "error");
  } finally {
    setBusy(null);
  }
};
$("open-export").onclick = async () => {
  try {
    await window.pageTrace.openExport();
  } catch (e) {
    message(e.message, "error");
  }
};
window.pageTrace.onProgress((p) => {
  if (p.phase === "httrack-download") {
    $("progress-title").textContent = "Downloading full website…";
    $("progress-detail").textContent =
      p.currentPath || p.site || "Downloading…";
    return;
  }
  if (p.phase === "capture") {
    $("progress-detail").textContent =
      `${p.files} files saved · ${size(p.bytes)} · ${p.pages} pages · ${p.queued} queued · ${p.url}`;
    return;
  }
  const labels = {
    "preparing-sample": "Preparing local example",
    "httrack-download": "Downloading full website",
    "reading-directory": "Reading folder",
    "parsing-source": "Analyzing source",
    inventory: "Measuring files",
    "resolving-references": "Connecting file references",
  };
  if (operation === "export")
    $("progress-detail").textContent =
      `${p.files.toLocaleString()} files processed · ${size(p.bytes)} retained`;
  else {
    $("progress-title").textContent =
      (labels[p.phase] || "Scanning website") + "…";
    $("progress-detail").textContent =
      `${p.files.toLocaleString()} files inspected · ${size(p.bytes)} inventoried${p.currentPath ? " · " + p.currentPath : ""}`;
  }
});
renderLegend();
renderPages();
renderFiles();
$("frameworks").append(text("span", "Choose a folder to detect technologies."));
$("warnings").append(text("li", "Scan a website to see its analysis notes."));
$("skipped").append(text("li", "Exclusions will appear after scanning."));

$("file-sort").onchange = renderFiles;
$("expand-outlines").onclick = () => {
  const items = [...document.querySelectorAll(".page-card details")];
  const expand = items.some((item) => !item.open);
  items.forEach((item) => (item.open = expand));
  $("expand-outlines").textContent = expand
    ? "Collapse all outlines"
    : "Expand all outlines";
};
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    navigate("files");
    $("search").focus();
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === "l"
  ) {
    event.preventDefault();
    window.pageTraceAppearance.set(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    );
  }
});

function showCaptures(result) {
  $("capture-results").hidden = false;
  $("capture-summary").textContent =
    `${result.paused ? "Paused. Resume this project folder to continue." : "Capture finished. Review status and failures before rebuilding."} Saved in ${result.directory}`;
  $("capture-sites").replaceChildren(
    ...result.sites.map((site) => {
      const row = text("div", "", "capture-site"),
        info = text("div", "");
      info.append(
        text("strong", site.url),
        text(
          "small",
          `${site.status.toUpperCase()} · ${site.pages} pages · ${site.files} files · ${size(site.bytes)} · ${site.failed ?? "See hts-log.txt for"} failures / rendering warnings`,
        ),
      );
      const button = text(
        "button",
        "Analyze & prepare AI export",
        "text-button",
      );
      button.disabled = !site.files;
      button.dataset.unavailable = String(!site.files);
      button.onclick = async () => {
        setBusy("scan");
        try {
          const result = await window.pageTrace.analyzeCapture(
            site.index,
            Number($("threshold").value),
          );
          data = result;
          $("search").value = "";
          $("decision-filter").value = "all";
          $("open-export").hidden = true;
          $("step-three").classList.remove("complete");
          render();
          navigate("overview");
          message(
            "Capture analyzed. Export the AI kit to a separate folder. Full captured assets stay on disk.",
          );
        } catch (e) {
          message(e.message, "error");
        } finally {
          setBusy(null);
        }
      };
      if (site.kit)
        info.append(
          text(
            "p",
            "Reconstruction kit ready: " + site.kit,
            "capture-description",
          ),
        );
      row.append(info, button);
      return row;
    }),
  );
}
async function beginCapture(resume = false) {
  setBusy("capture");
  message(
    resume
      ? "Choose the saved project folder containing project.json."
      : "Choose a destination for the full website captures.",
    "info",
  );
  try {
    const result = resume
      ? await window.pageTrace.resumeCapture()
      : await window.pageTrace.capture({
          urls: $("capture-urls")
            .value.split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          options: {
            mode: $("capture-mode").value,
            httrackFull: $("httrack-full").checked,
            maxPages: Number($("capture-pages").value),
            maxDepth: Number($("capture-depth").value),
            maxBytes: Number($("capture-mb").value) * 1048576,
            maxFiles: Number($("capture-files").value),
            maxFileBytes: Number($("capture-file-mb").value) * 1048576,
            delayMs: Number($("capture-delay").value),
            retries: Number($("capture-retries").value),
            include: $("capture-include").value,
            exclude: $("capture-exclude").value,
            externalAssets: $("capture-external").checked,
          },
        });
    if (result) {
      showCaptures(result);
      if (result.manifest) {
        data = result.manifest;
        $("open-export").hidden = false;
        $("step-three").classList.add("complete");
        $("search").value = "";
        $("decision-filter").value = "all";
        render();
      }
      message(
        result.paused
          ? "Capture paused and saved. Use Resume a saved capture to continue."
          : result.manifest
            ? "Full capture saved. Your essentials folder, schema, diagram and report are ready."
            : "Capture saved. Select a site to analyze, then export your AI kit.",
      );
    } else message("Folder selection cancelled.", "info");
  } catch (e) {
    message("Capture could not finish: " + e.message, "error");
  } finally {
    setBusy(null);
  }
}
$("capture-form").onsubmit = (event) => {
  event.preventDefault();
  beginCapture();
};
$("resume-capture").onclick = () => beginCapture(true);
$("open-capture").onclick = async () => {
  try {
    await window.pageTrace.openCapture();
  } catch (e) {
    message(e.message, "error");
  }
};

function updateCaptureControls() {
  const native = $("capture-mode").value === "httrack";
  const skip = $("httrack-full").checked;
  $("httrack-engine-note").hidden = false;
  $("capture-start").textContent = native
    ? "Download & build kit →"
    : "Capture websites →";
  const limits = [
    "capture-pages",
    "capture-files",
    "capture-depth",
    "capture-mb",
    "capture-file-mb",
  ];
  const unsupported = [
    "capture-pages",
    "capture-files",
    "capture-delay",
    "capture-include",
    "capture-exclude",
    "capture-external",
  ];
  for (const id of new Set([...limits, ...unsupported])) {
    const hidden =
      (skip && limits.includes(id)) || (native && unsupported.includes(id));
    if (skip && limits.includes(id)) $(id).value = "0";
    $(id).dataset.unavailable = String(hidden);
    $(id).disabled = hidden || !!operation;
    $(id).closest("label").hidden = hidden;
  }
}
$("capture-mode").addEventListener("change", updateCaptureControls);
$("httrack-full").addEventListener("change", updateCaptureControls);
updateCaptureControls();
