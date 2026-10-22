# PageTrace 0.4.1 scan-stability verification

[Native Windows release run](https://github.com/Sam4d/Manifest/actions/runs/39788423495) completed successfully. Release source: `f5489c718fb982cdfb57380f4347a25ad08fc8c8`.

## Checks that executed

- All 16 unit/integration tests passed, including capture and scan/export tests.
- The real Electron desktop scan/export suite passed on Windows.
- The multi-site/static/rendered capture desktop suite passed on Windows.
- Windows installer and portable packaging completed.
- The actual `dist/win-unpacked/PageTrace.exe` launched and completed the built-in sample scan with three parsed HTML pages; file search and dark mode passed.
- The actual self-extracting portable executable independently passed the same launch, sample scan, search, and appearance checks.
- Both packaged executable checks are gates before release publication, not just checks of source code under the development Electron executable.
- The published portable executable was downloaded, matched against the release's SHA-256 checksum, and its embedded archive passed 7-Zip integrity validation.

## Reproduced issue and correction

The previous reference matcher could spend excessive time searching export-heavy JavaScript for a later `from` token. A valid, approximately 1.84 MB fixture with 60,000 export declarations exceeded a five-second baseline limit. The corrected regression test completes within its test budget.

Reference matching is bounded. Source analysis runs in a dedicated worker with a three-second per-file budget. Timeouts produce explicit warnings while retaining the file inventory and lightweight-copy selection. Progress includes the phase and relative path. The built-in example now uses under 1 MiB of generated fixtures rather than approximately 52 MiB.

These fixture-based checks do not prove compatibility with every Windows device, filesystem, cloud-backed directory, antivirus configuration, or website. A stall specific to a user's device still needs its exact progress phase/path and app version to diagnose. The source-analysis deadline does not bound operating-system filesystem calls.

## Downloads

- [Windows portable executable](https://github.com/Sam4d/Manifest/releases/download/v0.4.1/PageTrace-Windows-x64.exe)
- [Windows installer](https://github.com/Sam4d/Manifest/releases/download/v0.4.1/PageTrace-0.4.1-x64-Setup.exe)
- [SHA-256 checksums](https://github.com/Sam4d/Manifest/releases/download/v0.4.1/SHA256SUMS.txt)

Close the older application before launching this release and confirm **v0.4.1** in the sidebar. Builds remain unsigned.
