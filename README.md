# serif

The VM-hosted backend and web portal for Libreflip's post-scan pipeline. It
receives scan jobs from [`sans`](https://github.com/libreflip/sans), the
book-scanning machine's own software. It hosts the web portal that users
reach through the QR code the machine shows after a scan. It runs the
post-processing (ScanTailor-Web image correction, OCR, eBook assembly) and
the shared library.

## Where serif is implemented

`serif` is implemented in
**[`SasquatchPDX/c-base_book-scanner`](https://github.com/SasquatchPDX/c-base_book-scanner)**
(Django + PostgreSQL + Redis/RQ), not in this repository. This repository
holds the planning and the contract with `sans`:

- **[`docs/sans-serif-interface.md`](docs/sans-serif-interface.md)** is the
  canonical, versioned contract between `sans` and `serif`. It covers the
  device API, authentication, TLS, the job lifecycle, upload, rescan and
  local retention. Change this file first when the contract changes.
- [`docs/feature-inventory.md`](docs/feature-inventory.md) is the compiled
  inventory of everything said about `serif` before implementation started
  (2026-11-07). It is historical context. Where it disagrees with the
  interface document, the interface document wins.
- Issues here track serif-side work that belongs to the Libreflip
  planning, for example #34 and #35 (rescan v2) and the interface tracking
  issue.

The repository previously held a 2019-era Ember.js prototype. It is still
recoverable from git history and nothing reuses it.

## License

MIT, see `LICENSE`.
