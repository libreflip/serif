# serif

The VM-hosted backend/frontend application for Libreflip's post-scan
pipeline: receives uploaded scan jobs from [`sans`](https://github.com/libreflip/sans)
(the book-scanning machine's own software), hosts the web portal users
reach via the QR code shown on the machine after a scan, and will
eventually run the post-processing pipeline (image correction, OCR,
eBook assembly).

**Status: not implemented yet.** This repository previously held a
2019-era Ember.js prototype (a 4-step onboarding tutorial, no actual
backend wiring) — that's gone now, but still fully recoverable from
this repo's git history if ever needed. Nothing about the current
plan reuses it; `serif`'s actual implementation language and
architecture aren't decided yet.

## Where the planning lives

`serif`'s requirements are tracked outside this repo for now, across:

- Open GitHub issues here and in
  [`libreflip/sans`](https://github.com/libreflip/sans/issues) (search
  for `MVP-` prefixed titles — tickets are numbered across both repos
  as part of one shared set).
- [`docs/feature-inventory.md`](docs/feature-inventory.md) — a compiled
  feature inventory covering everything currently known or still
  undecided about `serif`: infrastructure, target-state feature list,
  and the concrete requirements already locked in by `sans`-side
  tickets (upload payload shape, job ID format, QR-code URL scheme,
  etc.).

## License

MIT, see `LICENSE`.
