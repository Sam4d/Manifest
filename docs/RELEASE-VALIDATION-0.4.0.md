# PageTrace 0.4.0 release verification

Verified release source: [`69f3e96922140656c79f51b7f7bc18f067f668d3`](https://github.com/Sam4d/Manifest/commit/69f3e96922140656c79f51b7f7bc18f067f668d3).

## Confirmed checks

- [Linux checks](https://github.com/Sam4d/Manifest/actions/runs/39783293999): completed successfully.
- [Native Windows executable workflow](https://github.com/Sam4d/Manifest/actions/runs/39783294035): completed successfully.
- Windows unit/integration tests: **12 passed, 0 failed** in the published source revision.
- Existing real Electron scanner/export desktop suite: passed.
- Multi-site capture desktop suite: passed, including two sites, isolated JavaScript rendering, captured assets, original/mirror output, analysis and persisted project resume.
- Installer and portable x64 packaging: passed.
- Release assets: published, with `SHA256SUMS.txt`.

## Downloads

- [Portable Windows executable](https://github.com/Sam4d/Manifest/releases/download/v0.4.0/PageTrace-Windows-x64.exe)
- [Windows installer](https://github.com/Sam4d/Manifest/releases/download/v0.4.0/PageTrace-0.4.0-x64-Setup.exe)
- [Checksums](https://github.com/Sam4d/Manifest/releases/download/v0.4.0/SHA256SUMS.txt)
- [Complete release](https://github.com/Sam4d/Manifest/releases/tag/v0.4.0)

The installer and portable executable are approximately 104 MB each. Builds are unsigned.

## Documentation and limits

[Capture guide](CAPTURE.md) · [Portfolio and screenshots](PORTFOLIO.md)

These checks use deterministic fixtures and establish the tested workflow, not universal website compatibility, live-site performance or complete HTTrack option parity. Browser-only delivery remains deferred. Conditional mirror updates, authentication imports, custom proxy configuration, scheduling, HTTP Range resume and other omitted options are listed explicitly in the capture guide. The source inspection and successful release workflow do not replace broader production hardening or a device-specific installation test.
