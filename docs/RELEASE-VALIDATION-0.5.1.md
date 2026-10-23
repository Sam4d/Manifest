# PageTrace 0.5.1 release validation

Source: `7caf71d5d80954bec121167298a79b99cf44d7a9`.

[Successful native Windows build and checks](https://github.com/Sam4d/Manifest/actions/runs/39966688064), completed October 23, 2026.

| Check | Result |
| --- | --- |
| 20 unit/regression tests | Passed |
| Real Electron scanning, sample, themes, dialogs and export | Passed |
| Multiple-site and sandboxed rendered capture | Passed |
| Build HTTrack 3.50.5 from SHA-256-pinned public source | Passed |
| Real native HTTrack downloads HTML, CSS, JavaScript and media | Passed |
| Output directory containing spaces and commas | Passed |
| Preserve full mirror; derive essentials, schema, diagram and report | Passed |
| Automatic capture-to-kit through the real Electron interface | Passed |
| Run the engine copied into packaged resources | Passed |
| Launch actual unpacked Windows app and scan the three-page sample | Passed |
| Launch actual portable executable and scan the three-page sample | Passed |
| Publish portable executable, installer and SHA-256 checksums | Passed |

Both executables were published only after these checks passed. Windows runtime checks ran on GitHub's hosted Windows runner. They establish the tested workflows, not compatibility with every website, Windows configuration or HTTrack option.

A separate Linux manual check used one **2.5 GiB sparse file** named `hero.mp4` alongside HTML, CSS and JavaScript. Scan plus export took 92 ms; the original remained 2,684,354,560 bytes, and 219 bytes of source were selected. Parent-process RSS at completion was approximately 53 MiB. Schema and diagram files were generated. This demonstrates metadata scanning and exclusion of large media from the derived kit; it does not measure reading or downloading 2.5 GiB of actual video.

The bundled HTTrack executable is built from public source, not extracted from the supplied installer. Its corresponding source archive, build recipe, GPL license and dependency notices are included under `resources/httrack/` in the Windows distribution. [Engine behavior, inspection notes and illustrated workflow](HTTRACK.md).
