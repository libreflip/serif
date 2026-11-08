# `serif` (backend) feature inventory

> Compiled 2026-11-07, at ijon's request, by searching every planning
> document and ticket for backend/post-processing content, to give
> whoever eventually specifies `serif` a single starting point instead
> of scattered fragments. **Not a specification, not a decision
> record** — a compiled inventory of what's already been said, so
> nothing gets lost or re-discovered from scratch. Sources cited
> throughout; follow them for full context.
>
> **Renamed from `z2-feature-inventory.md` (2026-11-07).** "Z2" is
> retired as a separate concept — see "Terminology" below.

## Terminology — read this first, it's been inconsistent

**Current, correct model (ijon, 2026-11-07):** `serif` is one VM-hosted
application — frontend and backend logic together, one machine.
Whatever storage this machine actually uses (local disk, a mounted
share, anything else) is `serif`'s own internal implementation detail
— it has **zero** architectural significance for `sans` or for anyone
specifying `serif`'s software. `sans` has exactly one upload target:
`serif`. There is no separate "storage machine" to reason about as a
distinct component.

**"Z2" is retired as a name for a separate component.** Historically,
two different, conflicting usages existed:
1. `project-management/backlog.md`'s original `[Z2] Post-Processing-
   Pipeline` entry (2026-07-01 onward) used "Z2" loosely for the whole
   backend/post-processing cluster.
2. A later, narrower reading (briefly adopted in an earlier draft of
   this document, 2026-11-07) treated "Z2" as naming a *separate
   storage machine*, distinct from `serif`'s VM — **this was wrong**,
   corrected by ijon the same day: it's the same machine.

Going forward, this document (and the ticket set it supports) uses only
`serif` for the backend application, with no separate "Z2" component.
Older quoted sources below may still say "Z2" — read it as "the
backend," not as a hint that separate physical storage infrastructure
needs its own software-architecture consideration.

## Infrastructure

Source: `docs/project/target-state-requirements.md` §"Post-Processing
(Zielvorstellung)" (ijon, 2026-07-23), corrected 2026-11-07 (ijon) to
collapse the VM and its storage into one machine.

1. **The VM** — runs `serif`. Whatever storage is attached to it (local
   disk, a mounted network share, anything else) is an operational
   detail with no effect on `sans`'s or `serif`'s own software design —
   `sans` uploads to `serif`, period.
2. **Dedicated AI hardware** — a separate **Minisforum MS-S1 Max** (AMD
   Ryzen AI Max+ 395 "Strix Halo", Radeon 8060S iGPU, RDNA 3.5, 40 CUs,
   128GB LPDDR5x unified memory). No CUDA, but has ROCm support
   (preview status) with confirmed-working `vLLM`-ROCm inference and
   `llama.cpp` via Vulkan. **How `serif` would address this machine
   (API/service vs. batch job) is still not specified anywhere.**
   Already in operational use for MVP-04's cover-LLM metadata
   extraction. This one genuinely is separate hardware from the VM —
   unlike the storage question above, this distinction is real and
   still needs an answer.

## Full target-state feature list (long-term vision, not MVP-scoped)

Source: `docs/project/target-state-requirements.md`
§"Post-Processing (Zielvorstellung)", §"Web-Portal (Zielvorstellung)";
`project-management/backlog.md` `[Z2]`/`[Z3]` entries;
`project-management/decisions.md` (multiple 2026-07-21/23 entries).

### Post-processing pipeline
- Full target pipeline: raw images → image correction → OCR → eBook
  (incl. metadata).
- Runs asynchronously/decoupled from the scan itself — the scan always
  proceeds regardless of backend reachability; processing streams
  page-by-page once the backend is reachable, rather than waiting for
  scan completion.
- Simple queue, no parallel job processing needed (decided 2026-07-01
  — the machine itself can only scan one book at a time, but multiple
  already-scanned books could in principle process concurrently; a
  queue was still judged sufficient).
- Primary book languages: German and English.
- **eBook output format: user-selectable**, not fixed. Named formats:
  EPUB, PDF, MOBI, DjVu. Metadata included where the chosen format
  supports it. `Calibre` (`ebook-convert`) is the candidate conversion
  tool.

### Image-correction: ScanTailor webapp rebuild
- Wish (not a final implementation decision): rebuild ScanTailor's
  (and ScanTailor Advanced's) functionality as a webapp, **reusing
  their actual code**, not writing from scratch — "je mehr sich andere
  schon ausgedacht haben, auf das wir aufbauen können, desto besser"
  (ijon). Runs on the same VM as the rest of post-processing.
- **License constraint:** both codebases are GPLv3 — real code reuse
  makes the rebuild copyleft-obligated.
- ScanTailor's six processing stages: Fix Orientation, Page Split,
  Deskew, Select Content, Page Layout, Output (binarization, despeckle,
  dewarping, zones). Has an existing headless CLI batch mode
  (`scantailor-cli`) — a possible way to reduce porting effort by
  invoking the existing binary instead of porting algorithms, not
  decided. Also has automatic text-line detection + cylinder-surface +
  "snake" dewarping for book-curvature correction near the spine.
- `OCRmyPDF`/`unpaper` were considered as a simpler middle ground and
  **rejected** — they cover deskew/cleanup/OCR but not page-splitting,
  interactive content selection, or book-curvature dewarping; no real
  middle ground exists short of the full ScanTailor rebuild or an
  equally complex custom pipeline.
- **Scope reduction already decided:** Fix Orientation and Page Split
  (stages 1–2 of 6) aren't needed — fixed camera mounting makes them
  unnecessary, configure statically instead of rebuilding. Remaining
  scope: Deskew, Select Content, Page Layout, Output (incl. dewarping).
- Full technical research: `project-management/planning/scantailor-code-
  findings.md` (six-stage breakdown, CLI coverage/gaps — Fix Orientation
  has no CLI automation at all; image/fill zones and manual dewarping
  curves are GUI-only; every CLI flag is batch-global, not per-page).

### OCR
- Full-page OCR (distinct from the RPi's own small page-number-only
  OCR, MVP-08) is part of the long-term pipeline, not MVP.
- Candidate tool: `Unlimited-OCR` (Baidu) — document-structure-aware,
  very actively maintained (2026-06-22 release), MIT-licensed,
  strong benchmarks (93%+ OmniDocBench). Needs CUDA by default (it's a
  vision-language model) but confirmed runnable via ROCm/`vLLM` on the
  Minisforum AI hardware — one of `Unlimited-OCR`'s own officially
  supported serving methods. Caveats: ROCm on this chip is still
  preview/experimental, lower bandwidth than a real discrete GPU,
  Linux-only.

### Web portal (served by `serif`)
- Base scope: list of scan jobs with status, per-job processing status,
  scan/book metadata, download of the finished archive/eBook.
- **Reachable via a URL from a QR code** shown at the machine — this is
  in the *original* target-state vision (`target-state-requirements.md`,
  2026-07-01), though it was later flagged "not MVP" in the 2026-07-26
  MVP-narrowing pass. MVP-20 (this ticket set, 2026-11-07) reinstates it
  as an actual MVProduct requirement — see "Already-locked-in
  requirements" below.
- **Needs a stable, per-job URL (ijon, 2026-11-07).** `serif` must serve
  a page at `<base_url><job_id>` for every uploaded job — this is the
  exact URL MVP-20's QR code encodes. That page is what the operator's
  phone lands on immediately after scanning the code, so it needs to
  exist (even minimally — e.g. just a status line) as soon as jobs
  start getting uploaded, not only once the full correction UI and
  eBook assembly are built. The same URL/page later also hosts the
  ScanTailor-like per-step correction interface and, eventually, the
  finished eBook download — the URL's meaning is stable, only what's
  rendered there grows over time.
- c-base-internal only, no public routing (decided 2026-07-01). Possible
  LDAP login (c-base provides LDAP for all members) — whether a login
  is needed at all is still open.
- The touchscreen stays the primary interface for the scan process
  itself — the web portal is a separate, necessary surface for
  post-scan management, not a touchscreen replacement.

### Interactive per-step correction UI
- For every processing step (image-correction stages, page-number/
  completeness recognition, later zone detection), an automatic pass
  produces a suggestion the user can correct in the web UI — explicitly
  modeled on ScanTailor's own per-filter-stage auto-suggest + manual-
  correction interaction. This is likely the most expensive single
  piece of the whole post-processing software. Full derivation:
  `project-management/decisions.md`, entry 2026-07-21 "Generelles
  UX-Muster".

### Personal success-email notification
- The backend should send ijon a genuinely warm/celebratory email when
  a book is successfully scanned and post-processed. **Explicitly not a
  feature to promote** — ijon's own words: "that does not need to be a
  feature that needs to be promoted. silent, intransparent, in the
  background, just to make me happy." Not user-facing, no web-portal
  visibility, no user setting, and — per ijon's explicit instruction —
  must never appear in any public-facing documentation/feature list,
  only internal implementation notes like this one.
- Possible reuse: `alexandria`'s `services/email` stub
  (`moleculer-mail`, currently placeholder credentials only).
- Not specified: exact wording/tone, send address, SMTP setup.

## MVP-narrowed scope (what was actually needed for v1, decided
2026-07-26)

Source: `reference/z1-z3-triage-overview.md`, "Revidierter Z2-Scope für
MVP" — quoted in full, since it's the most concrete existing
scope-narrowing and predates the later `sans`-side MVPrototype/
MVProduct split by about three weeks (note: "Z2" in this quote means
the backend generally, per the old broad usage, not a separate
machine):

> Z2-Zwischenziel für v1: Der Nutzer bekommt am Ende **kein eBook**,
> sondern ein Archiv zum Download bestehend aus
> - einem wohlsortierten Stapel korrekt gedrehter Bildaufnahmen, so weit
>   nachbearbeitet wie **einfach/sinnvoll ohne komplexe Bildkorrektur**
>   möglich,
> - durchnummeriert und in der richtigen Reihenfolge,
> - mit einer "eleganten" Metadaten-Datei daneben.
>
> Kein OCR (außer der kleinen, lokalen Seitenzahl-Erkennung [on the
> RPi]), keine eBook-Assembly.

This excludes the whole "big four" cluster from MVP: the streaming
architecture, the ScanTailor webapp rebuild itself, the interactive
per-step correction UI, and the general auto-suggest-plus-correction UX
principle — kept as long-term target, not deleted.

**Gaps flagged at the time, relevant to whoever specifies `serif`:**
- Upload-failure behavior needs *some* defined behavior (at minimum:
  error message + manual retry) — flagged as possibly needing handling
  on `serif`'s receiving end too, not just the RPi's sending end (not
  distinguished in the source).
- Metadata-file format/content wasn't fixed at the time this was
  written — now resolved on the `sans`/MVProduct side, see below.
- A second, redundant completeness check on `serif`'s side (re-checking
  what the RPi already determined) is "cheap extra insurance," no
  objection to keeping it.

## Already-locked-in requirements from `sans`-side MVProduct tickets

These are decisions already made while specifying the RPi-side
(`sans`) tickets, which constrain whatever `serif` eventually becomes —
not open questions, things `serif`'s design needs to honor:

- **Upload payload, per job:** every archived page image, plus two
  sidecar files — `metadata.opf` (bibliographic metadata, in Calibre's
  own OPF/Dublin-Core format, chosen specifically so Calibre can read it
  natively later) and `scan.jsonl` (an append-only, newline-delimited
  event log: job header, calibration data, one `attempt` event per
  pickup attempt, one `page` event per archived page, a
  `completeness_check` event, and later `rescan_flag`/`rescan_replace`
  events). See the `sans`-side tickets' metadata-assembly spec for the
  full schema.
- **Job ID format:** `<YYYYMMDDTHHMMSSZ>`, assigned once at job start,
  used as the local job folder name and expected to remain the stable
  identifier `serif` indexes jobs by.
- **QR-code access (new, 2026-11-07):** after a successful upload, the
  machine builds an access URL from a configurable base address plus
  the job ID, generates a QR code from it, and shows it on the
  touchscreen. The URL points to that job's page in the web portal —
  not a raw file/archive download — so `serif` needs a real route at
  `<base_url><job_id>` serving *something* for every uploaded job from
  early on, even before the correction UI or eBook assembly exist. See
  "Web portal" above for the fuller requirement this implies.
- **Rescan replace-in-archive (v2):** a replacement image for a
  previously-flagged page overwrites the same filename in place (never
  renumbered, never renamed) and gets logged as a new `scan.jsonl`
  event (`rescan_replace`) — never a mutation of the original record.
  Whichever component on `serif`'s side handles this needs direct
  write access to the job's files.
- **Cover rectification (v2):** corner detection + perspective
  correction for the raw front/back cover photos, needed because a
  closed book cover has no fixed reference rectangle the way an
  interior page might. A known physical issue to account for: the
  binding-side edge of each cover photo is cut off by a couple of
  millimeters (left edge of the front-cover photo, right edge of the
  back-cover photo) — not yet solved, flagged for investigation when
  this is implemented. A working reference algorithm (Canny edge
  detection + largest-quadrilateral search + 4-point perspective
  transform) already exists in the discarded `alexandria` codebase
  (`services/camera/tools/correct.py`) and is a sound starting point,
  though it needs real engineering (crash-on-no-match is unhandled,
  it's a standalone script not a library function, and it's Python/
  OpenCV while `serif`'s own implementation language is still
  undecided).

## Open architecture questions (none resolved by this document)

- **AI-hardware addressing.** How `serif` would address the Minisforum
  AI hardware (API/service vs. batch job) is still not specified
  anywhere. This is the one genuine infrastructure-separation question
  left — unlike storage (resolved: same machine as `serif`, not a
  separate concern), the AI hardware really is separate physical
  hardware `serif` needs a real connection strategy for.
- **`serif`'s implementation language.** Not decided. Relevant to
  porting the cover-rectification algorithm and to any other
  language-specific tooling choices.

## Software ecosystem research (point-in-time, 2026-07-01/23, not
independently re-verified since)

| Tool | Purpose | Status at time of research |
|---|---|---|
| ScanTailor Advanced | Image correction | Inactive since 2023-09-13, GUI-only |
| tesseract | OCR | Actively maintained, headless CLI |
| OCRmyPDF | OCR + image correction combined | Actively maintained, headless, combines `unpaper` + `tesseract` — rejected as a post-processing middle-ground, see above |
| unpaper | Image correction (deskew, cleanup) | Active, CLI, headless |
| Calibre (`ebook-convert`) | eBook generation | Active, CLI, headless |
| `Unlimited-OCR` (Baidu) | OCR + document-structure-aware parsing | Very active, MIT license, strong benchmarks — needs CUDA by default, confirmed runnable via ROCm/`vLLM` on the Minisforum AI hardware |
| `spreads` | Camera control (from the original 2011 scanner stack) | No longer maintained — irrelevant now anyway, since camera control is `sans`'s own job |

## Source index

- `docs/project/target-state-requirements.md` — original target-state
  vision (post-processing, web portal, ScanTailor idea, ecosystem
  research, success email).
- `project-management/backlog.md` — `[Z2]`/`[Z3]` tracking entries
  (status history, old broad "Z2" usage).
- `project-management/decisions.md` — individual dated decisions
  (UX pattern, ScanTailor scope reduction, streaming/completeness,
  success email).
- `project-management/planning/scantailor-code-findings.md` — full
  ScanTailor technical research.
- `project-management/planning/scantailor-webapp-reference.md` — PM
  framing (license, open questions).
- `software-planning/architecture.md` AD-012 (`serif` naming), AD-002
  (rescan flow).
- `software-planning/implementation/serif-verbose.md` — prior
  compilation this document builds on and supersedes in scope.
- `software-planning/reference/z1-z3-triage-overview.md` — MVP-scope
  narrowing pass.
- `software-planning/reference/rescan-flow.md`,
  `reference/cover-photo-postprocessing.md` — v2 feature detail for
  rescan and cover rectification.
- `software-planning/tickets/mvp-10-book-metadata-sidecar-assembly.md`,
  `mvp-11-upload-to-z2.md`, `mvp-18-rescan-replace-in-archive.md`,
  `mvp-19-cover-photo-rectification.md`, `mvp-20-upload-access-qr-code.md`
  — the `sans`-side MVProduct tickets whose requirements constrain
  `serif`.
