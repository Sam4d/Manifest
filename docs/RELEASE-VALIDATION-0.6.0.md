# PageTrace 0.6.0 validation

Source: `8dcd00a681da5d9e544e529fa6097d61f65da892`.

[Native Windows release checks](https://github.com/Sam4d/Manifest/actions/runs/40035852256).

- 27 unit/regression tests cover scanning/export, capture limits and resume, runtime resolution and rejection of incomplete Windows bundles.
- Real Electron interaction checks cover scanning, export, sample completion, search, appearance, saved-mirror import and browser capture.
- The included native engine downloads a local website fixture with media; the automatic analysis/export pipeline generates the essentials copy, schema, diagram and report.
- A black-box check launches the app, completes its sample scan, then enters a URL and operates the actual native Windows output-folder dialog. It verifies JavaScript retention, media omission in the derived kit, multiple schema pages, SVG output and the HTML report's diagram.
- The black-box check runs before packaging and against both the actual packaged Windows app and portable executable. It uses no production test bypass and no external executable picker.
- The packaged download component is also exercised directly before publication. Runtime dependencies are verified against their file manifest; incomplete bundles fail packaging.

These checks cover deterministic local fixtures on the hosted Windows runner. They establish the tested capture-to-kit workflow, not complete replay of every website or exposure of every upstream engine setting. Full website uses the included HTTrack engine, with its license and corresponding source shipped in the release.

Published portable downloaded independently and checked against `SHA256SUMS.txt`: `3d85dcae4dc8d9c78be74ae87eb0ffdd55beb19291dda6263c7f8c90b25d8c75` (112,196,014 bytes). The public installer download also returned HTTP 200.
