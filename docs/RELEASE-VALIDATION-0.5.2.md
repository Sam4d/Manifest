# PageTrace 0.5.2 validation

Source: `1f6d9c77506ac8e3befb4f7623de2b0e9fc18722`.

[Successful Windows release checks](https://github.com/Sam4d/Manifest/actions/runs/39969863192).

- 23 unit/regression tests passed, including all-zero download caps, mixed positive/zero caps, saved zero values, resume, and native argument mapping.
- Real Electron checks passed for the default Skip download limits switch, optional zero-valued controls, scanning, export, sample and appearance.
- Native HTTrack downloaded the local fixture with zero depth/size limits; the automatic capture-to-essentials/schema/diagram flow passed.
- The engine copied into packaged resources passed the real download/export check.
- The actual unpacked Windows application and actual portable executable both launched and completed the sample scan.
- Installer, portable executable and SHA-256 checksums were published after those checks passed.

Zero means no PageTrace cap for page count, file count, depth, total bytes or per-file bytes. HTTrack mode omits zero-valued native depth/size options and uses HTTrack's native defaults. Retry count and delay are separate settings; zero means none. Existing projects retain their saved settings on resume. This validation covers the tested fixtures and hosted Windows runner, not every website or native HTTrack option.
