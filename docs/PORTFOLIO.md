# PageTrace portfolio and interview walkthrough

[Project home](../README.md) · [Visual user guide](USER-GUIDE.md) · [Architecture](ARCHITECTURE.md)

## What I built

PageTrace is an Electron and Node.js desktop application that captures public websites or turns a local website folder into an inspectable inventory and a lightweight reconstruction kit. It prepares source context for an AI-assisted rebuilding workflow without uploading files. Static scans do not execute site code; optional browser capture uses isolated script execution.

PageTrace 0.4 includes its own static and rendered capture stages. HTTrack folders remain supported through the existing local-folder workflow. See the [capture guide](CAPTURE.md) for supported features and explicit gaps.

## Resume bullets

Use these under **Projects**, and only claim work you actually contributed to and can explain:

- Built PageTrace, an Electron and Node.js desktop tool that inventories local website files, extracts static HTML structure with parse5, and exports a JSON manifest, HTML report and lightweight source copy for AI-assisted website reconstruction.
- Implemented source-preserving export rules that omit audio/video and oversized binary assets, with documented parsing limits, static-reference inspection and an omitted-assets checklist.

If Claude helped implement these features, describe the collaboration accurately. Do not claim independent implementation of components you cannot explain. This project does not establish professional AI/ML employment or model-training experience.

## Capture demonstration

![Multi-site capture controls](images/11-capture-setup.png)

![Completed two-site fixture capture](images/12-capture-results.png)

![Structure parsed from a JavaScript-rendered capture](images/13-captured-structure.png)

These screenshots come from the real desktop capture test against a local HTTP fixture, not a live customer website. Browser JavaScript creates a heading and image; the test verifies the DOM snapshot, durable asset files, site isolation, scanner integration and reopening a saved project after reload. The capture report records inaccessible URLs and configured boundaries. Do not describe this as full HTTrack parity or a production-scale benchmark.

Additional project bullets, if they reflect your reviewed contributions:

- Extended PageTrace with local multi-site capture, streamed downloads, robots-aware URL scope, persistent queue resume and bounded retries, preserving full responses alongside an AI-ready mirror.
- Added sandboxed Electron rendering for JavaScript-generated HTML, URL-to-file mapping and capture reports, with automated HTTP-fixture and real desktop integration checks.

## Visual demonstration

These existing repository screenshots show the generated Northstar Studio example. They are product demonstrations, not customer results or independently repeated benchmarks.

### 1. Explain the problem and overview

![PageTrace overview with generated sample](images/02-overview.png)

A downloaded website may be dominated by media bytes. PageTrace separates file inventory from retained-source estimates and identifies static HTML pages. The screenshot's potential reduction is an estimate for sample retained files, not the measured size of a complete export and not a token-reduction measurement.

### 2. Show preserved structure

![Static page outlines](images/03-structure.png)

Open Pages & structure. Expand one page and explain how headings, semantic tags, IDs and classes help describe the source. Static HTML is not the same as rendered browser layout or complete dynamic-route discovery.

### 3. Explain keep and omit decisions

![File inventory and export decisions](images/04-files.png)

Show a retained source file and an omitted media file. Source is retained regardless of size. Audio/video is omitted; other binary assets are omitted above the configured cutoff, 5 MiB by default. Recognized source above 2 MiB is retained without parsing. The original folder remains untouched.

### 4. Show the limitations

![Technology clues and scan notes](images/05-insights.png)

Discuss unresolved references, excluded paths and parsing bounds. Common credential filenames are excluded, but secrets embedded in ordinary source are not automatically detected. Removed media may still need replacement for visual reconstruction.

## Three-minute demo outline

| Time | Action | What to explain |
| --- | --- | --- |
| 0:00–0:25 | Show two URLs and capture controls | PageTrace downloads public resources locally, then prepares an AI source handoff. |
| 0:25–0:55 | Scan and show Overview | Distinguish inventoried bytes, estimated retained bytes and actual export size. Label generated sample data. |
| 0:55–1:30 | Expand a page outline | Show the title, headings and nested elements; explain static-analysis limits. |
| 1:30–2:00 | Inspect keep/omit decisions | Explain source retention, binary cutoff and the 2 MiB parsing limit. |
| 2:00–2:35 | Export outside the source folder | Open report.html, manifest.json, lightweight/ and REBUILD.md. Show the omitted-assets checklist. |
| 2:35–3:00 | Explain one tradeoff | Parsing limits bound analysis work, but large source files can still make the handoff too large for an AI context window. |

## Evidence to collect before claiming performance

Run this on a stable local website copy you have permission to use. Keep generated fixtures separate from real-site results.

| Measurement | Record |
| --- | --- |
| Input | Site type, scan settings, inventoried file count and bytes; explain excluded paths. |
| Environment | OS, CPU, RAM, app version and storage type. |
| Runtime | Scan and export durations measured separately. |
| Output | Actual complete export bytes, including reports, manifest and placeholders. |
| Preservation | Check expected pages, headings and selected local references against source. Report failures. |
| AI handoff | Record which files were actually submitted, model/tokenizer and token count where available. |
| Reconstruction | Check a predefined set of content/structure requirements; report manual repairs and missing media. |

Byte reduction = (input inventoried bytes − complete export bytes) / input inventoried bytes × 100. State that excluded input paths are outside this denominator. The result can be negative for tiny inputs because reports add overhead.

Do not infer token savings from omitted video bytes. Do not claim pixel-perfect cloning, guaranteed context fit, production use or a percentage improvement without corresponding evidence.

## Interview reference

- **Why Electron?** The current implementation combines a desktop UI and native folder dialogs with Node filesystem access. Discuss packaging size as a tradeoff.
- **How is HTML parsed?** parse5 produces a document tree; the scanner extracts bounded outlines, headings and metadata.
- **What is the process boundary?** The main process handles filesystem operations; a restricted preload API connects it to the renderer. Review the architecture guide and code before explaining security guarantees.
- **Why not parse every source file?** The current 2 MiB limit bounds individual parsing work. Inventory memory can still grow with file count.
- **What is missing for an AI engineering claim?** A verified model integration and evaluation would add evidence. The present project demonstrates developer tooling and preparation of AI context.
- **How did Claude help?** Identify specific tasks, what you reviewed, one error you caught and how you verified the correction. Be candid about code you are still learning.

## Review status

Updated for 0.4 with local automated capture/scanner/export tests and real Electron desktop runs. Screenshots were generated from the running application. Test fixtures are synthetic; no live-site performance benchmark, customer deployment or model/token-savings measurement is claimed.
