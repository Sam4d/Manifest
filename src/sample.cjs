const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
async function createSample(progress = () => {}, signal) {
  const report = (currentPath) => {
    signal?.throwIfAborted();
    progress({ files: 0, bytes: 0, phase: "preparing-sample", currentPath });
  };
  report("Creating temporary sample folder");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "PageTrace-sample-"));
  const site = path.join(root, "Northstar Studio");
  try {
    for (const dir of ["styles", "scripts", "images", "media", "work", "about"])
      await fs.mkdir(path.join(site, dir), { recursive: true });
    const shell = (title, body) =>
      `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>${title} — Northstar Studio</title><meta name="description" content="Independent design for people and places."><link rel="stylesheet" href="/styles/main.css"></head><body><header class="site-header"><a href="/index.html">Northstar</a><nav aria-label="Main navigation"><a href="/work/index.html">Work</a><a href="/about/index.html">Studio</a></nav></header><main id="content">${body}</main><footer class="site-footer"><p>Independent by nature. Thoughtful by design.</p><a href="mailto:hello@example.invalid">Get in touch</a></footer><script src="/scripts/main.js"></script></body></html>`;
    const pages = {
      "index.html": shell(
        "Home",
        '<section class="hero"><h1>A different kind of digital.</h1><p>We make thoughtful experiences for ambitious people.</p><video src="media/studio-reel.mp4" poster="images/studio-poster.jpg" controls></video><button>Discover our work</button></section><section class="selected-work"><h2>Selected projects</h2><article class="project-card"><h3>Form & Field</h3><p>An identity grounded in the everyday.</p><img src="images/project-cover.svg" alt="Form and Field project"></article></section>',
      ),
      "work/index.html": shell(
        "Selected work",
        '<section class="work-intro"><h1>Built with intention.</h1><p>A selection of identities, websites, and digital experiences.</p></section><section class="project-grid"><article><h2>Form & Field</h2><p>Brand strategy and digital experience.</p></article><article><h2>Open House</h2><p>A home for new perspectives.</p></article></section>',
      ),
      "about/index.html": shell(
        "The studio",
        '<section class="studio-intro"><h1>Small studio. Wide horizons.</h1><p>We believe good design makes space for possibility.</p></section><section class="team"><h2>The people behind the pixels</h2><article><h3>Our approach</h3><p>Listen carefully. Make intentionally.</p></article></section><section class="contact"><h2>Let’s build something.</h2><form><label>Your name<input name="name"></label><label>Your email<input name="email" type="email"></label><button>Say hello</button></form></section>',
      ),
    };
    for (const [file, content] of Object.entries(pages)) {
      report(file);
      await fs.writeFile(path.join(site, file), content, { signal });
    }
    await fs.writeFile(
      path.join(site, "styles/main.css"),
      ":root{--paper:#f5f1eb;--ink:#233b36}body{font-family:system-ui;background:var(--paper);color:var(--ink)}.hero{display:grid;grid-template-columns:1fr 1fr;gap:2rem}.project-grid{display:grid;grid-template-columns:repeat(2,1fr)}",
    );
    await fs.writeFile(
      path.join(site, "styles/tokens.css"),
      ":root{--space:8px;--radius:12px}",
    );
    await fs.writeFile(
      path.join(site, "scripts/main.js"),
      '// Example source. PageTrace never executes website code.\nexport const studio = "Northstar";',
    );
    await fs.writeFile(
      path.join(site, "package.json"),
      JSON.stringify(
        {
          name: "northstar-studio",
          dependencies: { vite: "^7.0.0", tailwindcss: "^4.0.0" },
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(site, "images/project-cover.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e4eade"/></svg>',
    );
    for (const [file, bytes] of [
      ["media/studio-reel.mp4", 512 * 1024],
      ["media/ambient.wav", 256 * 1024],
      ["images/studio-poster.jpg", 128 * 1024],
      ["images/team-original.png", 64 * 1024],
      ["images/thumbnail.png", 32 * 1024],
    ]) {
      report(file);
      const handle = await fs.open(path.join(site, file), "w");
      try {
        await handle.truncate(bytes);
      } finally {
        await handle.close();
      }
    }
    await fs.writeFile(
      path.join(site, "README.md"),
      "# Northstar Studio\nGenerated example website. Media files are sparse fixtures, not playable assets.",
    );
    await fs.writeFile(
      path.join(site, ".env.example"),
      "# Example only; excluded by the scan.",
    );
    signal?.throwIfAborted();
    return { root, site };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
module.exports = { createSample };
