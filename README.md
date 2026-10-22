# ◈ SiteSieve

**Less weight. More clarity.** An offline desktop tool that turns a local website folder into a blueprint for rebuilding it with your own elements.

## Run

Requires Node.js 22.12 or newer and a graphical desktop (Windows, macOS, or Linux).

```sh
npm ci
npm start
```

Choose a website folder, inspect the overview, pages, file inventory, and insights, then export to a destination **outside** the original website. A unique output directory is created each time. The app never intentionally writes into your input folder and never runs its code.

The default binary size threshold is 5 MiB. Set it before scanning. Video and audio are always omitted from the lightweight copy; larger binary assets are omitted above the threshold. Source files are retained regardless of size. This is a conservative source-preserving reduction, not a production optimizer or compiler.

## Reconstruction kit

- `manifest.json`: per-file sizes, decisions, timestamps, source hashes (for parsed source), local/external/unresolved references, page headings and content excerpts, semantic HTML elements, language extensions, and dependency-based framework clues.
- `report.html`: a standalone offline report with page structure, asset decisions, and warnings.
- `lightweight/`: retained source and assets, with explicit HTML video/audio elements replaced by a generic image placeholder. Matching HTML `src` and `poster` references to omitted assets are also replaced. Original media is excluded, not compressed.
- `lightweight/.sitesieve-*/SITESIEVE-OMITTED.json`: the media replacement checklist.
- `REBUILD.md`: reconstruction guidance and limitations for an AI assistant.

The lightweight copy is a **reconstruction starting point**. It is not guaranteed to run unchanged: media references in CSS, JS, srcset, runtime code, and dynamically constructed paths may need replacement. Dependencies are not installed or bundled into exports.

## Offline & privacy

After initial dependency installation, scanning and exporting require no network or cloud account. Website files are parsed as text, never loaded in a browser or executed. The Electron renderer uses context isolation, sandboxing, a restrictive content policy, and narrowly scoped IPC. Navigation and new windows are blocked.

Symlinks, common dependency/cache folders, and recognizable credential files (including `.env*`, private keys, and `.npmrc`) are excluded. This is **not a secret detector**: inspect exports before sharing proprietary code or credentials embedded in source. Sensitive content may occur in metadata, content excerpts, references, or ordinary code. Scan a trusted, stable local copy; do not modify the source while exporting.

## What analysis means

Layout is inferred from semantic HTML and headings. This version does not render screenshots, execute JavaScript, compile source, infer all SPA routes, decompress archives, or reproduce exact visual layouts. Package manifests provide framework clues; file extensions provide language clues. Source files above 2 MiB are inventoried and copied but not parsed. Reports clearly list parsing limitations and export failures. Export byte estimates exclude generated reports and placeholders.

## Development & checks

```sh
npm test
npm run test:desktop # functional UI smoke test; requires a graphical session
npm run package   # unpacked app in dist/ for the current OS
npm run dist      # distributable for the current OS; platform tools/signing may be needed
```

Build Windows installers on Windows and macOS installers on macOS. Signing identities are not included. Linux packaging produces an AppImage by default. Never disable Electron's sandbox for normal desktop use.

A CLI shares the same engine and works in headless environments:

```sh
node src/cli.cjs /path/to/website > manifest.json
node src/cli.cjs /path/to/website /path/to/export-parent
```

Tests use isolated temporary folders, validate functional exports and source preservation, cover credentials and symlinks, reject nested destinations, check changed files and HTML escaping, and inventory a sparse 2.5 GB media fixture without reading it into memory.

## Project structure

`src/scanner.cjs` is the filesystem analysis/export engine; `src/main.cjs` owns native folder dialogs and IPC; `src/preload.cjs` exposes the limited desktop bridge; `src/index.html`, `style.css`, and `renderer.js` implement the interface. The HTML tree is parsed with parse5; the application has no network services.

## Desktop downloads

The **Build desktop downloads** GitHub Actions workflow can be started manually to create Windows NSIS, macOS DMG, and Linux AppImage artifacts. These builds are unsigned, so your operating system may require a trust confirmation. Cross-platform installers require their respective runners and have not been validated by Linux-only checks. The Checks workflow runs scanner tests and the desktop UI smoke test on Linux.

Dependency audit at implementation time: production dependencies have no reported advisories. The build-only electron-builder dependency chain has eight moderate audit findings from its transitive sprintf-js dependency; npm audit fix did not resolve them. These packages are not included in the desktop app.
