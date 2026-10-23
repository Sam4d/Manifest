# Changelog

## 0.5.0 — Full capture to reconstruction kit

- Added the actual HTTrack engine capture mode, with automatic analysis and essentials export after the full mirror completes.
- Windows releases build and bundle verified HTTrack 3.50.5 source, its native dependencies, notices, corresponding source and build recipe.
- Exports now include schema.json, site-map.svg and an embedded page relationship diagram in the HTML report.
- Exclude installers, archives and source maps from the derived kit; preserve core source and conservative JavaScript dependencies.
- Added real-engine and real Electron end-to-end pipeline checks, plus packaged engine validation.

### Existing HTTrack project import

- Added a dedicated offline HTTrack project import with project validation and cache/log/profile exclusions.
- Preserve saved host paths and local links, with import provenance in manifest and report.
- Added real Electron import coverage, export fixtures, illustrated usage and transparent uploaded-installer inspection notes.
- HTTrack runs as a separate process; the supplied installer is not executed or redistributed.

## 0.4.1 — Scan stability

- Replaced reference matching that could stall on large JavaScript files.
- Isolated source parsing in a worker with a three-second per-file budget; timed-out files remain inventoried with a warning.
- Reduced sample fixtures to under 1 MiB instead of creating roughly 52 MiB of media stubs.
- Added current-file and phase progress, including sample preparation, and responsive parser cancellation.
- Continue past unreadable nested directories and preserve inventory byte accounting when source analysis fails.
- Added regression cases for export-heavy source, worker timeout/restart, live cancellation, and reference extraction.
- Gate Windows publication on launching and scanning with both the packaged app and the portable executable, beyond source-level tests.

## 0.4.0

- Added multi-site public website capture with static and isolated browser-rendered modes.
- Added streamed downloads, robots/redirect checks, URL include/exclude patterns, page/depth/file/size controls, delays and retries.
- Added persisted projects and file-level pause/resume, full original responses, rendered DOM snapshots and locally rewritten mirrors.
- Connected captured-site analysis to the existing AI export without deleting original media.
- Added readable capture reports and source-URL mappings carried into the AI handoff.
- Added deterministic HTTP and multi-site real Electron capture checks before Windows packaging.
- Updated the portfolio, screenshots and documentation with explicit capture/HTTrack limitations. Browser-only delivery remains deferred.

## 0.3.0 — PageTrace

- Renamed the application, executables, icon, export helpers, and documentation to PageTrace.
- Added white and `#00674F` emerald light mode and a matching deep-green dark mode.
- Added Light / Dark / Auto selection, persistence across reload, and live system-theme tracking in Auto.
- Added file sorting by path/size, keyboard search, a theme shortcut, and expand/collapse-all page outlines.
- Captured ten real desktop screenshots covering light mode, dark mode, and the file inspector.
- Expanded user, architecture, manifest, privacy, download, and troubleshooting documentation.
- Kept native Windows testing, installer/portable builds, SHA-256 checksums, and GitHub Release downloads.

Earlier versions used the SiteAtlas and SiteSieve names. PageTrace uses a new application identity and appearance preference. Existing website folders and previous exports are not migrated or changed. You may uninstall the older application separately if you no longer use it.
