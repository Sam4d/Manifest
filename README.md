# SiteAtlas

### See the website. Not the baggage.

An offline desktop app that maps a local website folder, explains its structure, and exports a lightweight blueprint for rebuilding it with your own content and media.

![SiteAtlas desktop overview](docs/images/02-overview.png)

## Get the Windows app

Two self-contained **Windows 10/11 x64** executables are built:

- **Setup** — an installer with a location picker and Start menu / desktop shortcuts.
- **Portable** — run without installing. Node.js is not required.

Get them from **[Actions → Windows executable](https://github.com/Sam4d/Manifest/actions/workflows/desktop-build.yml) → latest successful run → Artifacts → SiteAtlas-Windows-x64**. The workflow runs on relevant pushes to `main` and also supports manual runs. Builds are unsigned; publisher identity is not verified by Windows.

**[Read the illustrated usage guide →](docs/USER-GUIDE.md)**

## Three steps to a fresh start

1. **Choose a folder.** Select the extracted root of your local website. Set the large-binary cutoff before scanning if needed.
2. **Discover the structure.** Review the space breakdown, nested HTML layouts, headings, technologies, and file relationships. Search and filter the inventory; inspect individual files.
3. **Export your blueprint.** Choose a folder outside the original. A new, unique output folder contains a readable HTML report, an AI-ready JSON manifest, a lightweight source copy, and a rebuilding brief.

The original folder stays untouched. There are no uploads, cloud accounts, or network requests during scanning/exporting. The app never executes the website’s code. **Explore a sample** teaches the workflow using an actual local scan of generated fixtures.

## A closer look

| Pages & structure                                        | Files & assets                                          |
| -------------------------------------------------------- | ------------------------------------------------------- |
| ![Nested HTML layout view](docs/images/03-structure.png) | ![Searchable asset inventory](docs/images/04-files.png) |

![Built-in offline instructions](docs/images/06-guide.png)

See the [visual guide](docs/USER-GUIDE.md) for a walkthrough of every screen, export file, scan setting, and limitation. All screenshots come from the real app using its clearly labeled Northstar Studio sample.

## What’s in the reconstruction kit?

| File                                              | Purpose                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.html`                                     | Readable page structure, element outlines, technology clues, asset decisions, exclusions, and warnings.                                                                       |
| `manifest.json`                                   | File sizes, decisions, timestamps, parsed-source hashes, static references, page headings, content excerpts, metadata, nested elements, and dependency-based framework clues. |
| `lightweight/`                                    | Retained source and smaller assets, with supported HTML media placeholders.                                                                                                   |
| `lightweight/.siteatlas-*/SITEATLAS-OMITTED.json` | Checklist of omitted assets to replace with your own.                                                                                                                         |
| `REBUILD.md`                                      | AI handoff guidance and reconstruction limitations.                                                                                                                           |

Video/audio are always omitted; other binary assets are omitted above the selected cutoff (default 5 MiB). Source is retained regardless of size. The app omits media rather than compressing it. Reports and placeholder overhead are not included in retained-byte estimates.

## Analysis and privacy limits

Layout is inferred from static HTML, not browser rendering. SiteAtlas does **not** execute scripts, compile the site, infer all dynamic routes, decompress archives, or produce a pixel-perfect clone. CSS/JS/srcset/runtime media references may need manual replacement. Source above 2 MiB is inventoried/copied but not parsed; HTML rewriting follows the same limit. Outlines are capped at 2,000 elements and a bounded nesting depth.

Symlinks, common dependency/cache directories, and recognizable credential filenames (`.env*`, private keys, `.npmrc`, etc.) are excluded. This is **not a secret detector**: inspect source and exports before sharing them. Use a stable local copy and avoid changing files while scanning/exporting. The renderer uses context isolation, sandboxing, restricted IPC, a local-only content policy, and blocked navigation/new windows.

## Run from source

Requires Node.js **22.12+** and a graphical desktop.

```sh
npm ci
npm start
```

`npm ci` installs the matching Electron binary explicitly. Dependency installation requires network access; normal scanning/exporting does not.

```sh
npm test                    # scanner/export integration tests
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

Production npm dependencies currently have no reported advisories. The electron-builder build-only chain has eight moderate audit findings through its transitive `sprintf-js` dependency; `npm audit fix` does not currently resolve them. Those build helpers are not shipped in the desktop app.
