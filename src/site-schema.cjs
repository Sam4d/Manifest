const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function schema(scan) {
  return {
    schemaVersion: 1,
    name: scan.name,
    source: "static-analysis",
    limitations: [
      "Dynamic JavaScript routes and dependencies may be absent. Uncertain JavaScript is retained.",
    ],
    pages: scan.pages.map((p) => ({
      path: p.path,
      title: p.title,
      headings: p.headings,
      layout: p.layout,
    })),
    files: scan.files.map((f) => ({
      path: f.path,
      language: f.extension,
      decision: f.decision,
      reason: f.reason,
    })),
    relationships: scan.files.flatMap((f) =>
      f.references.map((r) => ({
        from: f.path,
        to: r.resolved || r.target,
        kind: r.kind,
      })),
    ),
  };
}
function diagram(scan) {
  const pages = scan.pages.slice(0, 80),
    width = 1000,
    height = 135 + pages.length * 65;
  const positions = new Map(pages.map((p, i) => [p.path, i]));
  let lines = "",
    nodes = "";
  for (const [i, p] of pages.entries()) {
    const x = i % 2 ? 530 : 30,
      y = 110 + i * 65;
    for (const r of scan.files.find((f) => f.path === p.path)?.references ||
      []) {
      const j = positions.get(r.resolved);
      if (j === undefined || j === i) continue;
      const tx = j % 2 ? 530 : 30;
      lines += `<path d="M${x + 210},${y + 22} L${tx + 210},${110 + j * 65 + 22}" stroke="#75b5a4" fill="none" marker-end="url(#arrow)"/>`;
    }
    nodes += `<g><rect x="${x}" y="${y}" width="420" height="48" rx="9" fill="#eef8f3" stroke="#00674f"/><text x="${x + 12}" y="${y + 19}" font-size="13" fill="#143d32">${xml((p.title || p.path).slice(0, 55))}</text><text x="${x + 12}" y="${y + 37}" font-size="11" fill="#3d665b">${xml(p.path.slice(0, 65))}</text></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Website page relationship diagram"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#75b5a4"/></marker></defs><rect width="100%" height="100%" fill="white"/><g font-family="system-ui,sans-serif"><text x="30" y="35" fill="#00674f" font-size="24">${xml(scan.name)} · website map</text><text x="30" y="62" fill="#143d32" font-size="13">${scan.pages.length} HTML pages · ${scan.files.length} files · arrows show discovered local page links</text><text x="30" y="84" fill="#3d665b" font-size="12">${scan.pages.length > 80 ? "First 80 pages shown; schema.json contains the full graph." : "Static source map; dynamic routes may need manual review."}</text>${lines}${nodes}</g></svg>`;
}
module.exports = { schema, diagram };
