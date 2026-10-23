# PageTrace

### See the website. Not the baggage.

[![Checks](https://github.com/Sam4d/Manifest/actions/workflows/checks.yml/badge.svg)](https://github.com/Sam4d/Manifest/actions/workflows/checks.yml)
[![Windows executable](https://github.com/Sam4d/Manifest/actions/workflows/desktop-build.yml/badge.svg)](https://github.com/Sam4d/Manifest/actions/workflows/desktop-build.yml)

**Website capture · Rendered HTML snapshots · Asset inventory · AI-ready reconstruction kits**

A local desktop app that captures public websites or analyzes existing folders, explains their structure, and exports a lightweight blueprint for AI-assisted rebuilding with your own content and media.

![PageTrace multi-site website capture](docs/images/11-capture-setup.png)

## Get the Windows app

Two self-contained **Windows 10/11 x64** executables are built:

- **Setup** — an installer with a location picker and Start menu / desktop shortcuts.
- **Portable** — run without installing. Node.js is not required.

**[Download the Windows executable →](https://github.com/Sam4d/Manifest/releases/latest/download/PageTrace-Windows-x64.exe)**

Or open [Releases](https://github.com/Sam4d/Manifest/releases/latest) for the installer and SHA-256 checksums. Releases are published automatically after successful Windows checks and packaging. Builds are unsigned; publisher identity is not verified by Windows.

**[Read the illustrated usage guide →](docs/USER-GUIDE.md)**

## Download everything first. Rebuild with the essentials.

The default **Full website** mode includes its download engine inside PageTrace. You do not install another app, use a terminal, or locate an executable. **Skip download limits** is enabled by default; uncheck it for individual caps, with **0 = unlimited**. It downloads the full mirror, then automatically creates a separate essentials folder, AI-ready schema, HTML report and SVG website diagram. The original capture stays intact. Depth/size limits and HTTrack discovery still apply; unavailable or undiscovered files cannot be guaranteed. [Pipeline and engine documentation](docs/HTTRACK.md).

## HTTrack projects welcome

Already have a WinHTTrack mirror? Expand **Use an existing website download** and click **Import saved mirror**, select the project containing `hts-cache`, then analyze and export a lightweight blueprint. Download caches, logs and profile settings are excluded. PageTrace also reads existing HTTrack projects offline. [Illustrated HTTrack guide and inspection notes](docs/HTTRACK.md).

![Import an HTTrack mirror](docs/images/14-httrack-import.png)

## Additional capture modes

Paste multiple website URLs. Capture linked pages/assets in **Fast** mode or use **Browser** mode for sandboxed JavaScript-rendered HTML. Set page/depth/file/size limits, retries, delays and URL filters. Pause and resume a persisted project. Each site gets its own full original capture, a rewritten mirror, URL mapping and a readable failure report. Select a site to analyze and export the smaller AI kit.

All crawling uses your computer's connection. No crawling server or cloud upload is required. [Read the capture guide and explicit limits](docs/CAPTURE.md). Fast and Browser are optional alternatives to the included Full website engine. Capturing a website cannot recover its private server code or database.

## Light or dark. Always local.

| White + emerald (`#00674F`)                          | Matching dark mode                                       |
| ---------------------------------------------------- | -------------------------------------------------------- |
| ![PageTrace light mode](docs/images/02-overview.png) | ![PageTrace dark mode](docs/images/07-dark-overview.png) |

Choose **Light**, **Dark**, or **Auto** in the top bar. Your selection is remembered. Auto follows your device’s theme. Every view, the file inspector, input control, and dialog uses the selected palette. Reduced-motion preferences are respected.

**Interactive controls:** search paths, filter export decisions, sort files by size/path, inspect references, expand page outlines, cancel scans, and open the last export in Explorer. Use **Ctrl/Cmd + K** to search files and **Ctrl/Cmd + Shift + L** to switch light/dark.

## Three steps to a fresh start

1. **Capture or choose a folder.** Enter URLs and click **Download & build kit** for automatic Full website capture, analysis and export. Or choose the root of an existing local website. Set the large-binary cutoff before scanning if needed.
2. **Discover the structure.** Review the space breakdown, nested HTML layouts, headings, technologies, and file relationships. Search and filter the inventory; inspect individual files.
3. **Export your blueprint.** Choose a folder outside the original. A new, unique output folder contains a readable HTML report, an AI-ready JSON manifest, a lightweight source copy, and a rebuilding brief.

The original folder stays untouched. There are no uploads, cloud accounts, or network requests during scanning/exporting. Static analysis never executes website code. Browser capture explicitly runs remote scripts in a separate sandboxed, disposable window. **Explore a sample** teaches the workflow using an actual local scan of generated fixtures.

## A closer look

| Pages & structure                                        | Files & assets                                          |
| -------------------------------------------------------- | ------------------------------------------------------- |
| ![Nested HTML layout view](docs/images/03-structure.png) | ![Searchable asset inventory](docs/images/04-files.png) |

![Built-in offline instructions](docs/images/06-guide.png)

See the [visual guide](docs/USER-GUIDE.md) for a walkthrough of every screen, export file, scan setting, and limitation. All screenshots come from the real app. Analyzer screenshots use the Northstar Studio sample; capture screenshots use a deterministic local HTTP/JavaScript fixture.

## What’s in the reconstruction kit?

| File                                              | Purpose                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.html`                                     | Readable page structure, element outlines, technology clues, asset decisions, exclusions, and warnings.                                                                       |
| `manifest.json`                                   | File sizes, decisions, timestamps, parsed-source hashes, static references, page headings, content excerpts, metadata, nested elements, and dependency-based framework clues. |
| `lightweight/`                                    | Retained source and smaller assets, with supported HTML media placeholders.                                                                                                   |
| `lightweight/.pagetrace-*/PAGETRACE-OMITTED.json` | Checklist of omitted assets to replace with your own.                                                                                                                         |
| `REBUILD.md`                                      | AI handoff guidance and reconstruction limitations.                                                                                                                           |

Video/audio are always omitted; other binary assets are omitted above the selected cutoff (default 5 MiB). Source is retained regardless of size. The app omits media rather than compressing it. Reports and placeholder overhead are not included in retained-byte estimates.

## Analysis and privacy limits

Layout is inferred from static HTML, not browser rendering. Static analysis does **not** execute scripts. Optional browser capture runs scripts to record a bounded DOM snapshot. PageTrace does not compile backend source, infer all dynamic routes, decompress archives, or produce a pixel-perfect clone. CSS/JS/srcset/runtime media references may need manual replacement. Source above 2 MiB is inventoried/copied but not parsed; HTML rewriting follows the same limit. Outlines are capped at 2,000 elements and a bounded nesting depth.

Symlinks, common dependency/cache directories, and recognizable credential filenames (`.env*`, private keys, `.npmrc`, etc.) are excluded. This is **not a secret detector**: inspect source and exports before sharing them. Use a stable local copy and avoid changing files while scanning/exporting. The renderer uses context isolation, sandboxing, restricted IPC, a local-only content policy, and blocked navigation/new windows.

## Run from source

Requires Node.js **22.12+** and a graphical desktop.

```sh
npm ci
npm start
```

`npm ci` installs the matching Electron binary explicitly. Dependency installation requires network access; normal scanning/exporting does not.

```sh
npm test                    # capture, scanner and export integration tests
npm run test:capture:desktop # multi-site browser capture and saved project resume
npm run test:desktop        # real Electron interaction test on a desktop
npm run package             # unpacked app for the current OS
npm run dist:win            # Windows installer + portable x64 executable
npm run dist                # current-platform distribution
```

Linux CI uses `xvfb-run -a npm run test:desktop:ci`. That isolated CI process passes `--no-sandbox` because hosted Ubuntu restricts Chromium user namespaces; **normal app launches do not**. To refresh screenshots on Linux, run `xvfb-run -a npm run test:desktop:ci -- --screenshots`.

Windows builds are unsigned. `signExecutable: false` keeps application icon/metadata editing enabled while omitting certificate signing. Build on Windows for the standard native workflow. Cross-building the executable from Linux is supported by electron-builder, with its native build helpers downloaded as needed; Windows runtime behavior must still be tested on Windows.

### Headless CLI

```sh
node src/cli.cjs /path/to/website > manifest.json
node src/cli.cjs /path/to/website /path/to/export-parent
```

### Project layout

- `src/scanner.cjs`: filesystem analysis/export engine, cancellation and export progress.
- `src/main.cjs` / `preload.cjs`: native folder dialogs, controlled IPC, and opening the last export.
- `src/index.html`, `style.css`, `renderer.js`: desktop interface and offline guide.
- `src/sample.cjs`: clearly labeled generated sample website; sparse media is measured, not loaded.
- `scripts/desktop-smoke.cjs`: real renderer → preload → IPC → scan/export integration checks and screenshot capture.
- `docs/USER-GUIDE.md`: illustrated instructions.

Tests cover source preservation, credentials and symlinks, nested destinations, changed files, HTML escaping, entity decoding, nested layouts, output collisions, cancellation, and a sparse 2.5 GB file. Desktop checks cover validation, navigation, filtering, the file inspector, exports, guide, and sample scanning.

Use `npm audit --omit=dev` to check current shipped dependency advisories and `npm audit` for build-tool dependencies. Build helpers are not shipped in the desktop app.

## Documentation

- [Website capture guide](docs/CAPTURE.md): multi-site capture, rendering, resume, output files, status reports and HTTrack comparison.

- [Portfolio and interview walkthrough](docs/PORTFOLIO.md): illustrated project explanation, resume bullets, a three-minute demo, and an evidence checklist.

- [Illustrated user guide](docs/USER-GUIDE.md): every screen, ten real screenshots, themes, shortcuts, exports, Windows setup, and troubleshooting.
- [Manifest reference](docs/MANIFEST.md): schema, field meanings, static-reference limits, and an AI reconstruction prompt.
- [Architecture and development](docs/ARCHITECTURE.md): processes, IPC, offline/privacy boundaries, performance, testing, and release workflow.
- [Changelog](CHANGELOG.md): what changed and upgrade notes.

## Discoverability and keywords

PageTrace is useful for **offline website analysis, local website auditing, website structure mapping, HTML hierarchy inspection, CSS and JavaScript inventory, asset size analysis, heavy media removal, AI context preparation, source-code reconstruction, website redesign planning, JSON manifest extraction, and Windows desktop development**.

These terms describe the implemented workflow. PageTrace captures public client-side resources and prepares rebuilding context. It does not expose backend source or guarantee automatic, complete website cloning.
