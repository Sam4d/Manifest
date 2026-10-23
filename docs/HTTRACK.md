# HTTrack → PageTrace

HTTrack is a website mirroring application; PageTrace adds the structure analysis and smaller AI reconstruction kit after a download. Version 0.5 adds the real HTTrack command-line engine to Windows releases, automatic reconstruction-kit creation after capture, and a separate **Import HTTrack mirror** action for existing projects.

![HTTrack import in PageTrace](images/14-httrack-import.png)

## Download → essentials → schema and diagram

1. Enter one or more public website URLs in PageTrace.
2. Choose **Full website · recommended** (the default). Windows releases include the download engine and all its runtime dependencies. There is no external executable chooser, separate installation, or terminal step. Incomplete Windows bundles fail the packaging check.
3. Leave **Skip download limits** checked, or uncheck it to set individual limits. **0 means unlimited** for depth, total MiB and per-file MiB. There are **no media-type exclusions during download**: HTTrack performs the full mirror, including the videos that it discovers within those limits. Its robots handling and native parsing apply. No downloader can recover undiscovered URLs, unavailable content, or server-side application code.
4. Choose a destination and start. Each URL gets a complete mirror. PageTrace then automatically analyzes it and creates a separate `PageTrace-*` reconstruction kit in the capture project. The results show its path.
5. Open the kit's `report.html` to see structure, technologies, asset decisions and the page-link diagram. `schema.json` contains the full static page/dependency graph; `site-map.svg` is the standalone diagram. `manifest.json` and `REBUILD.md` support the AI handoff. Essential source is under `lightweight/`.

The screenshot below shows an actual local HTTP fixture completing the entire engine → analysis → automatic export flow. The full capture and ready reconstruction kit appear together; **Open export folder** opens the kit.

![Completed HTTrack download and automatic reconstruction kit](images/16-httrack-pipeline.png)

The full download is never reduced in place. Videos/audio, large binaries, installers, archives and source maps are omitted from the derived kit. HTML, CSS, JavaScript and smaller supporting assets remain. JavaScript is conservatively retained because static analysis cannot reliably distinguish core code from dynamically loaded code. Media placeholders and missing dependencies may still need adjustment during rebuilding.

Full website mode uses its native connection-timeout defaults and maps retry counts directly. **Skip download limits** sets the download caps to zero and hides them. With it unchecked, any positive depth, total-byte or per-file-byte value maps to a native option; zero omits that option. Native HTTrack discovery defaults still apply (including its default depth of 9999). Page/file counts, delay, include/exclude filters and external-assets controls apply to the built-in capture modes, not this adapter; the UI hides them in Full website mode. A successful engine exit is labeled **REVIEW LOG** because it can still contain per-URL failures or hit a limit; inspect `hts-log.txt`. Pause stops the native engine, preserving its cache; resuming the PageTrace project invokes HTTrack's cache continuation. The built-in Browser mode remains available separately for rendered DOM capture.

### Diagram example

The diagram below is generated from PageTrace's local sample website, not a design mockup. Page arrows represent discovered local links; the JSON schema includes asset relationships as well.

![Generated website relationship map](images/15-website-map.svg)

## Use an existing HTTrack project

1. Finish or stop your download in HTTrack first. Avoid importing while it is still modifying files.
2. Open PageTrace and find **Use an existing website download** in the website capture panel.
3. Expand **Use an existing website download**, then click **Import saved mirror** and choose the project directory containing `hts-cache`, alongside the downloaded host directories. Select the project itself, not its parent or an individual host folder.
4. PageTrace validates recognizable cache metadata, then scans the saved HTML, stylesheets, scripts and assets. Existing relative links and host folder paths are preserved. Multiple host directories remain together.
5. Explore Pages & structure, Files & assets, and Technology & notes. Export to a separate folder for `report.html`, `manifest.json`, `REBUILD.md`, and the `lightweight/` website.

The original project is unchanged. Import and export are offline. Neither HTTrack nor the saved site's JavaScript is executed. Media replacement and the binary cutoff use PageTrace's normal export rules.

## What stays out

- Every directory named `hts-cache`, including archive caches and profile settings.
- Root `hts-log.txt`, `hts-err.txt`, `hts-in_progress.lock`, `winprofile.ini`, and `cookies.txt`.
- The scanner's usual dependency folders, symbolic links and recognized credential files.

Cache configuration is not parsed or included in the manifest. Skipped paths are recorded without their contents. The exported manifest's `import` field identifies HTTrack/local-mirror provenance; the HTML report includes the same provenance. Root landing pages generated by HTTrack may appear in the page inventory.

A project with its cache removed can still be scanned with **Choose website folder**, but that generic action does not apply HTTrack-specific metadata exclusions. Inspect files before sharing an export.

## Boundaries

PageTrace runs HTTrack as a separate process, with no command shell. **Resume a saved capture** handles projects created by PageTrace (including HTTrack-backed captures); importing a standalone HTTrack project does not convert its cache into a PageTrace capture project. Original network URLs are not guessed from saved paths; query-string mapping, download history, robots decisions and HTTrack's update engine are not imported. PageTrace cannot recover server-side code from a mirror.

## Uploaded installer inspection

The supplied file `httrack_x64-3.50.5.exe` was inspected as data, without executing it:

- Size: 10,264,992 bytes.
- SHA-256: `047e4d224891f90ed49a574db5dea67e602ed22b0c614b5008cc3357995136de`.
- PE installer metadata reports **WinHTTrack Website Copier Setup**, product version **3.50.5.0**, built with Inno Setup. The 32-bit setup loader does not establish the architecture of its packaged application.
- The available InnoExtract 1.9 tool rejected the loader/setup format and reported a checksum mismatch. That failed extraction is not evidence of malware, nor a successful signature or payload verification. No claim is made that this particular upload is an authentic upstream installer.
- Instructions or text inside the executable were treated as attachment data, never as commands or user instructions.

Rather than decompile an installer, implementation used the public HTTrack workflow and source documentation. Upstream [`src/htshelp.c`](https://github.com/xroche/httrack/blob/master/src/htshelp.c) documents mirroring output/cache paths and cache-based continuation. Its source header specifies **GPL-3.0-or-later**; see upstream [COPYING](https://github.com/xroche/httrack/blob/master/COPYING). These observations concern the public source examined, not a verified license inventory of the unextracted upload. The Windows release builds the unmodified HTTrack 3.50.5 source from the Debian upstream archive, checks its SHA-256, and bundles the separate CLI, required DLLs, GPL license, dependency notices, corresponding source archive and build recipe under `resources/httrack/`. See [`scripts/build-httrack.ps1`](../scripts/build-httrack.ps1). No bytes from the uploaded installer are redistributed. HTTrack remains a separate project by Xavier Roche and contributors.

## Verification

Automated fixtures check project recognition, rejection of non-project folders, preserved host-relative links, exclusion of cache/log contents from exported files, provenance in JSON/HTML, and an unchanged original cache. The real Electron desktop check clicks the new action through the renderer/preload/native-dialog path and completes a scan. Existing capture, scan, cancellation and export checks also remain enabled. This does not establish compatibility with every historical HTTrack cache layout or every website.

Native Linux checks also exercised the actual HTTrack 3.50.5 engine against a local HTTP fixture (including media), followed by analysis and export. A real Electron test drives the Full website mode and verifies automatic schema, diagram and report generation. Windows publication additionally builds the engine from source and tests both its staged and packaged copies before publishing.

## Zero and skip limits (0.5.2)

**Skip download limits** is on by default. Enter URLs, click **Download & build kit**, and choose the destination. To use a cap, uncheck the switch and enter a positive value. Zero means unlimited for the five download limits: pages, files, link depth, total bytes, and per-file bytes. Fast/Browser modes honor the same convention. Zeros are stored as zeros in saved projects, including resume. Retry count and delay are separate settings: zero means no retries or no delay, respectively. Download limits do not change the media-removal policy used to build the lighter copy.

## Self-contained app (0.6)

Downloading is part of PageTrace. The main interface calls it **Full website**. The app never asks users to choose a downloader executable. The Windows bundle includes its runtime and dependencies; a manifest and packaging guard reject missing components. The open-source HTTrack engine remains an implementation dependency with its source and license included, not a separate user setup step. Maintainers building from source must assemble the included runtime using the Windows build workflow before packaging; published users simply run PageTrace.

Release checks now operate the actual Windows destination-folder dialog and perform a complete capture through the packaged app itself. They verify JavaScript retention, media omission in the derived copy, and generated schema, diagram and report. No production automation bypass or external-tool picker is used.
