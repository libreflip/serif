# sans ↔ serif interface, version 1

> **Status:** specification, ready for implementation. Decided with ijon on
> 2026-11-17. This is the **canonical contract** between `sans` (the
> scanner's Raspberry Pi application, [`libreflip/sans`](https://github.com/libreflip/sans))
> and `serif` (the VM-hosted backend and web portal).
>
> `serif` is implemented in
> [`SasquatchPDX/c-base_book-scanner`](https://github.com/SasquatchPDX/c-base_book-scanner)
> (Django), not in this repository. That repository's
> `docs/scanner-protocol.md` documents the server side of this contract and
> must link back here. If the two disagree, this document wins until both
> are reconciled. Changing the contract means changing this file first.

## 1. Scope

This document covers everything `sans` and `serif` exchange:

| Flow | Direction | Ticket(s) |
|---|---|---|
| Reachability, authentication and clock check | sans → serif | new |
| Job registration under the scanner's own job ID | sans → serif | sans#47 |
| Per-page image upload in the background | sans → serif | sans#49, sans#51 (replaces their transport) |
| Front/back cover photos | sans → serif | sans#39 |
| `scan.jsonl` process events | sans → serif | sans#48 |
| `metadata.opf` bibliographic metadata | sans → serif | sans#48, #40–#43 |
| Capture complete, checksum-verified hand-off | sans → serif | sans#49 |
| Abort | sans → serif | sans#20 (Abort Book) |
| QR code to the job's portal page | sans → (phone) → serif | sans#52 |
| Jobs with open rescan requests | sans → serif (query) | sans#55, serif#34 |
| Rescan details, thumbnails, calibration | sans → serif (query) | sans#56 |
| Replacement image for a rescan request | sans → serif | sans#56, serif#35 |

Outside this contract: what `serif` does internally (storage layout,
ScanTailor-Web, OCR, eBook building, library), and what `sans` does
internally (motion, capture, OCR of page numbers).

## 2. Decisions this contract is built on

Each of these resolves a contradiction between the libreflip planning and
what c-base_book-scanner had built. Each was decided by ijon on 2026-11-17.

| # | Topic | Decision |
|---|---|---|
| D1 | Job identity | The **sans job ID is the job's primary key in serif.** serif stops generating UUIDs for scanner jobs. Jobs created by hand in the web UI keep server-generated UUIDs. Both are opaque, immutable strings. |
| D2 | Job ID uniqueness | sans only starts a job with an NTP-synchronised clock. serif rejects a job ID that already exists with different content (`409 job_id_conflict`). |
| D3 | Bibliographic metadata | **sans is authoritative.** Its `metadata.opf` becomes the book's metadata. serif's own identification and review queue only runs for a scan job if sans supplies no title. |
| D4 | Upload timing | **Page by page, in the background**, as soon as sans has spare CPU time and serif is reachable, at low CPU and I/O priority. Uploading never blocks or slows scanning. Without a connection, sans keeps everything locally until it can transfer it. |
| D5 | Local retention on sans | sans keeps raw books until it needs the space for new scans. It then deletes the **oldest jobs that serif has confirmed by checksum**, without asking, and always keeps a configured free-space headroom. |
| D6 | Scan lifecycle on serif | An uploaded scan is a **raw scan** (`captured`). It becomes a library book only after serif's post-processing (ScanTailor-Web) and an explicit finish. A raw scan never appears in the library. |
| D7 | Rescan storage | serif's model applies: a replacement creates a **new page version** and keeps the old one. Rescan requests are `ScanTodo` rows in the database, and the stable page identity is the `sequence_number`. serif also appends `rescan_flag` and `rescan_replace` events to the job's `scan.jsonl`, so the sans#48 log contract holds. Rescans are allowed while a scan is `captured`, and also after it is `complete`. |
| D8 | Configuration | serif: environment variables (`BOOK_SCANNER_*`). sans: the Machine profile (`sans.toml`), following sans's own convention. |
| D9 | Authentication | Per-device API key, sent as `Authorization: Bearer`. No user session, cookie or CSRF on the scanner API. |
| D10 | Transport security | HTTPS with **TLS 1.3 only**. Certificates come from an internal CA or are self-signed, and sans verifies them against a configured CA file. Nothing beyond that. |
| D11 | Portal access | The QR code's target needs the normal serif login (LDAP or local), like every other portal page. After login the user lands on the job page. |
| D12 | Direction | **sans always initiates.** serif never connects to sans. sans needs serif's address; serif needs no address for sans. |

Smaller inconsistencies, resolved without changing anyone's intent:

- **Job ID format.** sans#47 says `YYYYMMDDTHHMMSSZ`. The example in sans#48
  says `20260825T143201Z-a1b2`. `md-pile/.../rescan-flow.md` says
  `2026-07-26T14-32-01Z-a1b2c3`. The sans code (`create_session_directory`)
  produces `YYYYMMDDTHHMMSSZ`, plus `-1`, `-2`… on a local collision. **The
  code's format is canonical** (§4.1).
- **Log name.** MVPrototype writes `pressure-log.jsonl` (sans#20/#27).
  MVProduct renames it to `scan.jsonl` (sans#48). c-base_book-scanner#7 and
  PR #113 say `scan.log`. All three are the same file: the JSON Lines log
  the scanner writes while scanning. **`scan.jsonl` is canonical** everywhere
  (harmonised 2026-11-17: libreflip/sans#81, SasquatchPDX/c-base_book-scanner#134,
  libreflip/md-pile docs). Every line carries a `type`; Capture attempts are
  `"attempt"`.
- **Data model.** The `metadata.json` model in `rescan-flow.md` §5 is
  superseded by `metadata.opf` plus `scan.jsonl` (sans#48).
- **No writes to storage.** c-base_book-scanner#7 says the scanner "produces
  a scan … directly into the attached storage". It does not. sans only talks
  to serif's API, as `serif-feature-inventory.md` and PR #113 already say.
- **Scope of `finish`.** In the existing c-base_book-scanner API, `finish`
  means "build the library book". sans never calls it. sans's own end of
  capture is `capture-complete` (§6.8).

## 3. Topology, network and security

```
 c-base LAN (not routed to/from the internet)

 ┌──────────────┐  HTTPS, TLS 1.3, Bearer key   ┌───────────────── VM ─────────────────┐
 │ sans (Pi)    │ ────────────────────────────▶ │ nginx :443 ─▶ uvicorn (Django)       │
 │ upload worker│                               │   /api/scanner/v1/…  (device API)    │
 └──────────────┘                               │   /j/<job_id>, /scan/…, /library/…  │
        ▲ NTP (udp/123)                         │   (portal, login required)          │
        └────────────────────────────────────── │ chrony (NTP server for the LAN)     │
 ┌──────────────┐  HTTPS, TLS 1.3, login        └──────────────────────────────────────┘
 │ phone/laptop │ ────────────────────────────▶ (same nginx)
 └──────────────┘
```

- **Network.** serif listens only inside the c-base LAN. nginx restricts
  `server` blocks with `allow <c-base LAN CIDRs>; deny all;`. The VM has no
  public address or port forwarding, and the scanner API is not exposed
  separately.
- **TLS.** nginx terminates TLS with `ssl_protocols TLSv1.3;`. There is no
  plain-HTTP API. Port 80 may redirect browsers to HTTPS, but sans never
  follows a redirect to `http://`, and it never sends its key over plain
  HTTP. Uvicorn listens on `127.0.0.1` only (see the nginx README in
  c-base_book-scanner on trusted proxy headers).
- **Certificates.** Use a certificate for the VM's LAN host name (for example
  `serif.c-base.lan`), issued by a small internal CA or self-signed. sans
  verifies the chain against the CA file in its profile and checks the host
  name. sans has no "skip verification" option.
- **API keys.** Each scanner device has its own key: 32 random bytes,
  base64url-encoded without padding. serif stores only its SHA-256 hash.
  A high-entropy key needs no slow hash. Keys are created, rotated and
  revoked with a management command (§7.2), never through LDAP. A key only
  authorises `/api/scanner/v1/`. It cannot reach library, review, admin or
  portal routes, and a session cookie cannot reach `/api/scanner/v1/`.
- **Clock.** serif (or the c-base NTP server) provides NTP to the LAN. sans
  refuses to start a new job while its clock is not NTP-synchronised (§4.1).
- **Untrusted input.** serif treats everything sans sends as untrusted.
  Images are decoded with Pillow, OPF is parsed with `defusedxml`, and size
  limits (§6.12) apply before parsing. Filenames from sans are never used as
  storage paths.

## 4. Data model shared by both sides

### 4.1 Job ID

```
job_id = YYYYMMDDTHHMMSSZ [ "-" N ]     regex: ^[0-9]{8}T[0-9]{6}Z(-[1-9][0-9]{0,3})?$
```

- sans assigns it once, when the job starts (cover capture, sans#39). It is
  the UTC time from an **NTP-synchronised** clock, plus `-N` if that local
  folder already exists. It is also the local job folder's name.
- sans refuses to start a job while the kernel reports the clock as
  unsynchronised (`adjtimex`/`ntp_adjtime` returns `TIME_ERROR` or sets
  `STA_UNSYNC`). The screen says so in plain language and offers no
  override.
- The ID is immutable. It is never derived from title or ISBN, and never
  reused.
- serif treats it as an opaque string. A job ID first registered by device A
  belongs to device A. Any registration of the same ID with a different
  `scan_started_at` or by another device is `409 job_id_conflict`.
- **Limitation:** the format assumes one scanner per serif. A second scanner
  would need a per-device prefix. That is a v2 contract change, not covered
  here.

### 4.2 Pages

| Field | Meaning |
|---|---|
| `sequence_number` | Immutable, **zero-based** capture-order identity. Even = Left camera, odd = Right camera. It is not the printed page number. |
| file | `NNNN.jpg` locally (4 digits, zero-padded; longer if needed). serif does not rely on the name. |
| `recognized_page_number` | String or `null` (sans#46), sent with the page and in the `page` event. |

On serif, each sans page is one `ScanPage` with
`logical_sequence_number = sequence_number` (0 is valid for v1 API jobs),
`side = single` and `capture_layout = single_page`. The camera role travels
in the page metadata, and serif checks it against the parity. A page has one
or more immutable `ScanPageVersion`s. Exactly one is active.

### 4.3 Covers

There are two cover photos per job, `front` and `back`, captured raw
(sans#39). Rectification (sans#75) is a later improvement. sans always
uploads the raw photo. A rectified version, if sans ever produces one, is a
new version of the same cover.

### 4.4 `scan.jsonl` events

The format and event types are as defined in sans#48. One JSON object per
line, each with a `type`. The log is append-only, and readers skip unknown
types and unknown fields.

- sans owns lines from **origin `sans`**. They are numbered `1, 2, 3…` in
  file order (`line_no`), and that numbering is the idempotency key.
- serif adds lines from **origin `serif`**: `rescan_flag` and
  `rescan_replace`. Each carries the sans#48 fields plus `"origin": "serif"`,
  `"at"` (ISO 8601 UTC) and `"todo_id"`.
- serif stores every line raw and in arrival order, and writes the combined
  `scan.jsonl` into the job's storage folder whenever it changes. The write
  is atomic (write to a temporary file, then rename). sans's lines keep their
  relative order.
- serif projects the event types it knows into its database:
  - `job` → `page_width_mm`, `page_number_crop` on the job.
  - `page` → `recognized_page_number` and `status` on the page.
  - `completeness_check` → the job's completeness flags, shown in the portal.

  `attempt` and unknown types are stored but not interpreted.

### 4.5 `metadata.opf`

Calibre-style OPF 2.0, as specified in sans#48. Per D3 it is authoritative:

- serif stores every upload as a new immutable version on the job. The
  newest version is current.
- While the scan is a raw scan (`open`, `capturing`, `captured`), the
  current OPF's title, authors, ISBN and language are shown on the job page.
  It creates **no** `Book` and nothing in the library (D6).
- At finish (§5), serif links the job to a `Book`:
  - If the OPF's ISBN matches exactly one existing `Book`, the job is linked
    to that book, which then gains a new variant ("Book ≠ File").
  - Otherwise a new `Book` is created from the OPF fields, with provenance
    `scanner_opf`.
  - If the OPF has no title, serif's existing scan identification and review
    queue runs instead, as it does today.
- An OPF uploaded after finish updates the linked `Book`'s
  scanner-provenance fields. serif records the change in its history. Fields
  a reviewer edited by hand in serif are not overwritten. Such a conflict
  opens a review task.

## 5. Scan lifecycle on serif

```
            PUT job          first page        capture-complete       finish (portal, human)
  (none) ───────────▶ open ───────────▶ capturing ───────────▶ captured ───────────▶ finalizing ──▶ complete
                        │                  │                       │  ▲                                │
                        └── abort ─────────┴────▶ cancelled        │  └── replacement after complete ───┘
                                                                   └── ScanTailor-Web, rescans
```

| State | Meaning | Visible in library? |
|---|---|---|
| `open` | Registered, no page received yet | no |
| `capturing` | Pages arriving; sans has not finished the book | no |
| `captured` | **Raw scan.** sans finished, every file verified by checksum. Awaiting post-processing (ScanTailor-Web) and finish. Shown in the portal as "Raw scan, being processed". | no |
| `finalizing` | A human pressed finish; serif builds variants (existing pipeline) | no |
| `complete` | A library book | yes |
| `cancelled` | sans aborted the book (Abort Book), or a human cancelled it | no |

- `capture-complete` is allowed only from `open` or `capturing`.
- **finish** stays the existing human action in the portal
  (`POST /scan/jobs/{id}/finish/`). It is never called by sans. For a
  `captured` scan it requires processed ScanTailor output, as it does today.
  Book linking follows §4.5.
- **A replacement after `complete`** (rescan of a library book) stores the
  new version, invalidates the downstream derived artifacts (existing
  logic), and puts the job back to `captured` with the note "re-finish
  needed". The library keeps the existing variants until the job is
  finished again.
- Existing web-created jobs and the existing session-based `/scan/…` API keep
  working. They also gain `captured`.

## 6. HTTP API (`/api/scanner/v1/`)

### 6.1 Conventions

- Base: `<serif url>/api/scanner/v1/`. Every request needs
  `Authorization: Bearer <api key>`. `Accept: application/json`.
- Responses are JSON, UTF-8. Timestamps are ISO 8601 UTC with `Z`.
- Error body, always:

  ```json
  {"error": {"code": "page_conflict", "message": "human readable", "details": {}}}
  ```

- **Checksums.** Every uploaded file is accompanied by its SHA-256, given as
  lowercase hex in the part's metadata. serif recomputes it and answers
  `422 checksum_mismatch` on a difference.
- **Idempotency.** Every write is safe to repeat. Repeating an identical
  write returns `200` and changes nothing. A first write returns `201`.
- **Versioning.** `v1` only grows in backwards-compatible ways: new optional
  fields, new endpoints, new event types. Anything else is `v2` under a new
  path. Clients ignore unknown response fields.
- `{job_id}` must match §4.1. Otherwise the answer is `400 invalid_job_id`.
  A job that belongs to another device is `404`, not `403`, so that job IDs
  cannot be probed.

### 6.2 `GET ping`

Checks reachability, authentication and the clock. sans calls it before
each upload run and while idle (§8).

`200`:

```json
{"api_version": 1, "scanner_id": "libreflip-01", "server_time": "2026-11-17T18:02:11Z",
 "limits": {"max_image_bytes": 52428800, "max_opf_bytes": 1048576,
            "max_event_batch_bytes": 1048576, "max_event_batch_lines": 1000}}
```

If `|server_time − local time| > 120 s`, sans logs a warning and shows a
clock warning on the idle screen. It does not upload with a skewed clock;
uploading resumes when the clocks agree again.

### 6.3 `PUT jobs/{job_id}`: register a job

Called as soon as the job exists locally and serif is reachable.

Request:

```json
{"scan_started_at": "2026-11-17T14:32:01Z", "capture_layout": "single_page"}
```

| Status | Meaning |
|---|---|
| `201` | Created (`open`) |
| `200` | Already registered by this device with the same `scan_started_at` |
| `409 job_id_conflict` | The ID exists with other data or for another device. sans stops uploading this job and shows "Upload blocked: job ID conflict, contact a maintainer". The fix is a documented maintenance procedure (sans side), not automatic. |

Response (also for `GET jobs/{job_id}`): see §6.4.

### 6.4 `GET jobs/{job_id}`: job status and received inventory

```json
{"job_id": "20261117T143201Z", "state": "capturing",
 "portal_url": "https://serif.c-base.lan/j/20261117T143201Z",
 "events": {"sans_last_line_no": 57},
 "pages": [{"sequence_number": 0, "sha256": "…", "version": 1}],
 "covers": [{"position": "front", "sha256": "…", "version": 1}],
 "metadata_opf": {"sha256": "…", "version": 2},
 "open_rescans": 0}
```

sans uses this after a restart, or after a lost response, to work out what
serif already has. It never re-sends files serif has confirmed.

### 6.5 `PUT jobs/{job_id}/pages/{sequence_number}`: upload a page

`multipart/form-data` with two parts:

- `metadata` (JSON):

  ```json
  {"sha256": "…", "camera_role": "left", "captured_at": "2026-11-17T14:33:12Z",
   "recognized_page_number": "23", "status": "ok"}
  ```

- `image` (`image/jpeg`): the canonical JPEG, byte-identical to the local
  file.

| Status | Meaning |
|---|---|
| `201` | Stored as version 1. The job moves `open` → `capturing`. |
| `200` | Same checksum already active. Nothing changes. |
| `409 page_conflict` | A different image already exists for this `sequence_number`. sans never rewrites a committed page, so this indicates a bug. sans stops that job's upload and logs it. Replacements only go through §6.11. |
| `409 job_state` | The job is `captured`, `complete` or `cancelled`. |
| `422 checksum_mismatch` / `invalid_image` / `camera_role_parity` | Rejected. sans retries a checksum mismatch once by re-reading the file. Anything else is permanent for that file. |

### 6.6 `PUT jobs/{job_id}/covers/{front|back}`

Same multipart shape as §6.5, with `metadata`
`{"sha256", "captured_at"}`. The same checksum is `200`. A new checksum adds
a new version (`201`), which allows a later rectified cover. Allowed in
`open`, `capturing` and `captured`.

### 6.7 `POST jobs/{job_id}/events`: append `scan.jsonl` lines

```json
{"first_line_no": 58, "lines": ["{\"type\":\"attempt\",…}", "{\"type\":\"page\",…}"]}
```

`lines` holds the raw line strings, without newline, byte-identical to the
local file.

| Status | Meaning |
|---|---|
| `200` | Stored. Response `{"sans_last_line_no": 59}`. Lines at or below the stored high-water mark must be byte-identical; they are confirmed and skipped. |
| `409 event_gap` | `first_line_no` > high-water + 1. `details.expected_first_line_no` says where to resume. |
| `409 event_conflict` | An already-stored line differs. This is a bug: sans stops and logs it. |
| `422 invalid_event` | A line is not a JSON object with a string `type`, or exceeds 64 KiB. |

Allowed in every state except `cancelled`, so sans can still deliver the
final `completeness_check` and later events.

### 6.8 `PUT jobs/{job_id}/metadata`: upload `metadata.opf`

Multipart: `metadata` `{"sha256"}` plus `opf`
(`application/oebps-package+xml`). The same checksum as the current version
is `200`. A new one is `201`. The file must be well-formed OPF with a
`package/metadata` element (`422 invalid_opf` otherwise). Applying it follows
§4.5.

### 6.9 `POST jobs/{job_id}/capture-complete`

Sent by sans after Finish Book, once it believes every file and every event
line has been delivered. Request: the full local manifest.

```json
{"finished_at": "2026-11-17T15:40:00Z",
 "sans_last_line_no": 812,
 "pages":  [{"sequence_number": 0, "sha256": "…"}, …],
 "covers": [{"position": "front", "sha256": "…"}, {"position": "back", "sha256": "…"}],
 "metadata_opf": {"sha256": "…"}}
```

| Status | Meaning |
|---|---|
| `200` | Every listed item is present with exactly that checksum as its active version, and the event high-water mark matches. The job is now `captured`. Response `{"verified": true, "state": "captured", "portal_url": "…"}`. Repeating it returns the same. |
| `409 incomplete` | `details.missing` / `details.mismatched` list the item keys. sans uploads those and calls again. |
| `409 job_state` | `cancelled`. |

A `200` from this call is the **only** confirmation that allows sans to
delete the job locally (D5, §8.5). `metadata_opf` may be `null` if the
operator dismissed the metadata form (sans#43). serif then runs its own
identification at finish (§4.5).

### 6.10 `POST jobs/{job_id}/abort`

Abort Book on sans. Moves the job to `cancelled`. Uploaded data is kept
("preserve originals"), and an admin may delete it. Idempotent.

### 6.11 Rescan (v2 flow, sans#54)

**`GET rescans`**: jobs of this device with at least one open rescan todo, in
any state except `cancelled` (sans#55):

```json
{"items": [{"job_id": "20261117T143201Z", "state": "captured",
            "title": "…", "authors": ["…"], "isbn": "…", "open_rescans": 2,
            "scan_started_at": "…"}]}
```

`title`/`authors` come from the current OPF, or the linked `Book`, or are
`null`.

**`GET jobs/{job_id}/rescans`**: what sans#56 needs to run the prompt loop:

```json
{"job_id": "…", "page_width_mm": 148.0,
 "page_number_crop": {"left": {"x":0,"y":0,"w":0,"h":0}, "right": {"x":0,"y":0,"w":0,"h":0}},
 "pages": [{"sequence_number": 0, "recognized_page_number": null}, …],
 "todos": [{"todo_id": 41, "sequence_number": 24, "reason": "glare",
            "created_at": "…", "thumbnail_url": "/api/scanner/v1/jobs/…/pages/24/thumbnail"}]}
```

`pages` lets sans interpolate a page-number range for pages without a
recognised number (sans#56). sans does that, not serif.

**`GET jobs/{job_id}/pages/{sequence_number}/thumbnail?max=800`**: a JPEG of
the active version, longest edge ≤ `max` (default 800, at most 1600), with
`ETag`.

**`POST jobs/{job_id}/rescans/{todo_id}/replacement`**: multipart:

- `metadata`:

  ```json
  {"sha256": "…", "captured_at": "…", "camera_role": "left",
   "recognized_page_number": "23", "page_number_verified": true}
  ```

- `image`: the replacement JPEG.

Effects, atomic on serif's side:
1. A new active `ScanPageVersion` for that `sequence_number`. The previous
   version is kept, inactive.
2. The todo becomes `completed`.
3. A `rescan_replace` event is appended (origin `serif`).
4. Downstream derived artifacts are invalidated.
5. The state changes as in §5.

| Status | Meaning |
|---|---|
| `201` | Done. Response: the new version and the todo state. |
| `200` | The same checksum already fulfilled this todo. |
| `409 todo_state` | The todo was cancelled. sans skips that page. |
| `422` | As in §6.5. |

`page_number_verified: false` (OCR mismatch, operator chose to keep the
image anyway) is stored and shown in the portal next to the page.

**Flagging** (serif#34) is a portal action: it creates the `ScanTodo` and
appends `rescan_flag`. It is allowed for `captured` and `complete` jobs (D7)
and is not part of the device API.

### 6.12 Limits (defaults, served by `ping`)

| Item | Limit |
|---|---|
| Page or cover image | 50 MiB (a 3840×2160 q95 JPEG is about 3–6 MiB) |
| OPF | 1 MiB |
| Event batch | 1 MiB and 1000 lines; one line ≤ 64 KiB |
| nginx `client_max_body_size` for `/api/scanner/` | 64 MiB |

### 6.13 Status code handling (client rules for sans)

| Response | sans action |
|---|---|
| Connection error, TLS error, timeout, `429`, `502`/`503`/`504`, other `5xx` | Transient: back off (30 s, 1 min, 2 min, … capped at 10 min, ±20 % jitter), retry. Nothing is ever deleted. |
| `401`, `403` | Configuration problem: pause all uploads, show "serif rejects this scanner's key" on the idle screen, re-check with `ping` every 10 min. |
| TLS certificate or host-name verification failure | Configuration problem: as above, "serif certificate not trusted". |
| `409` | Per endpoint (above). Unknown codes: pause that job and log it. |
| `400`, `404`, `413`, `415`, `422` | Permanent for that item: mark it failed, log it, show "N files could not be uploaded" on the idle screen, never auto-delete the job. |

## 7. Configuration

### 7.1 sans: Machine profile (`sans.toml`)

A new **optional** `[serif]` table. Without it, sans scans normally, shows
"Upload not configured" on the idle screen, and never deletes anything
automatically.

```toml
[serif]
# Base URL of serif's HTTPS endpoint; the API is <url>/api/scanner/v1/.
url = "https://serif.c-base.lan/"
# QR code = portal_job_url_prefix + job_id (sans#52).
portal_job_url_prefix = "https://serif.c-base.lan/j/"
# File holding this device's API key (one line). Must be readable only by the
# sans user (mode 0600); sans refuses to start uploads otherwise.
api_key_file = "/home/pi/.config/sans/serif-api-key"
# CA certificate (PEM) that signed serif's certificate.
ca_file = "/home/pi/.config/sans/serif-ca.pem"
# Free space to keep on the data_root file system at all times (D5).
min_free_bytes = 8_000_000_000
```

The URLs must be `https://`. Validation rejects anything else. The key lives
in a separate file, so the profile can be copied, compared and backed up
without leaking it. Adding the table changes the profile schema
(`deny_unknown_fields`), so `SCHEMA_VERSION` goes to 5 and the template
`sans.example.toml` gains the table commented out.

### 7.2 serif: environment variables

| Variable | Meaning |
|---|---|
| `BOOK_SCANNER_PUBLIC_BASE_URL` | Required in production. Example: `https://serif.c-base.lan/`. Used to build `portal_url` in API responses and the `/j/` links. |
| `BOOK_SCANNER_SCANNER_API_ENABLED` | `true` by default. `false` answers `503` on `/api/scanner/v1/`. |
| `BOOK_SCANNER_SCANNER_MAX_IMAGE_BYTES` | Default 52428800. |
| `BOOK_SCANNER_SCANNER_MAX_OPF_BYTES` | Default 1048576. |

The existing `BOOK_SCANNER_MAX_UPLOAD_BYTES`, `ALLOWED_HOSTS`, TLS and HSTS
settings stay as they are.

Device keys are records, not environment variables (they need rotation and
revocation, as c-base_book-scanner Sprint020 H already requires):

```
manage.py scanner_device create <scanner_id> [--name "libreflip at c-base"]   # prints key once
manage.py scanner_device rotate <scanner_id>    # new key, old one invalid immediately
manage.py scanner_device revoke <scanner_id>
manage.py scanner_device list
```

## 8. Behaviour on sans

### 8.1 Upload worker

- There is one background worker thread, separate from the controller
  thread. It never holds controller state. It only reads files the
  controller has **committed** (after the Capture cycle's durable write) and
  the job folder's own records.
- **Low priority.** The worker thread sets `setpriority(PRIO_PROCESS, tid, 19)`
  and `ioprio_set(IOPRIO_CLASS_IDLE)` for itself. It uploads one file at a
  time over one connection (HTTP keep-alive), with no parallel uploads.
- **When.** Whenever `ping` succeeds, the worker drains the queue in this
  order:
  1. Oldest job first.
  2. Within a job: register (§6.3), then event lines, pages in
     `sequence_number` order, covers, OPF, and finally `capture-complete`
     once the job is finished locally.
  3. Then rescan replacements (§6.11).

  It works during scanning as well; the priorities keep it out of the way.
- **Offline.** If `ping` fails, the worker waits with backoff (§6.13) and
  tries again. All data stays on disk.

### 8.2 Persistent local upload state

Per job folder, sans keeps `upload.jsonl`. It is append-only and holds one
line per item serif confirmed:

```json
{"item": "page", "sequence_number": 24, "sha256": "…", "confirmed_at": "…"}
{"item": "events", "sans_last_line_no": 57, "confirmed_at": "…"}
{"item": "capture_complete", "confirmed_at": "…"}
```

Pending work = committed local items not yet in `upload.jsonl`. After a
restart, the worker reconciles with `GET jobs/{job_id}` (§6.4) before
sending anything. This makes "upload later" and background retry (sans#51)
survive a reboot without any extra marker.

### 8.3 Operator-visible status (never silent)

The idle screen shows one plain line:
- "All books uploaded"
- "2 books waiting to upload"
- "Uploading 'Title' – 143/312 pages"
- "serif not reachable – will retry"
- "Upload not configured"
- "serif rejects this scanner's key"
- "Clock not synchronised – cannot start a new book"

There is no popup for background events. The upload-failure screen from
sans#51 ([Try again] / [Upload later]) appears only if capture-complete has
not succeeded within one attempt when the operator finishes the book and is
waiting for the QR code. [Upload later] leaves everything to the background
worker.

### 8.4 QR code (sans#52)

After capture-complete returns `200`, sans shows the QR code for
`portal_job_url_prefix + job_id`. If capture-complete is still pending,
sans shows the same QR code labelled "Upload in progress – the page will be
ready shortly". The URL is fixed by then, and serif answers it as soon as
the job is registered.

### 8.5 Local retention (D5)

- Before a new job starts, and after each committed Capture cycle, sans
  checks free space on `data_root`'s file system.
- **Required free space** = `min_free_bytes` plus an estimate for the next
  book: twice the largest job folder on disk, or 2 GB if there is none.
- When free space is below that, sans deletes whole job folders, **oldest
  first** (by job ID). It only deletes jobs whose `upload.jsonl` contains
  `capture_complete` **and** whose last `GET jobs/{job_id}` shows every
  local checksum present, confirmed immediately before deleting. There is no
  prompt and no message beyond a log line. Never-confirmed, aborted,
  in-progress and conflicting jobs are never deleted automatically.
- If space is still short and nothing else is deletable, sans refuses to
  start a new job. It says "Storage full – N books not yet uploaded".
- During a running scan sans never deletes the running job. If space runs
  short mid-book, the existing save-failure path (Save blocked, sans#20)
  applies.

### 8.6 Rescan client (sans#55/#56)

The on-device job list comes from `GET rescans`. Each todo is fulfilled with
`…/replacement`. The replacement JPEG is written to the local job folder
under `rescan/<todo_id>.jpg` first and queued like any other item, so the
upload is retried if serif is unreachable. If the original job folder was
already deleted (§8.5), sans creates a minimal local folder for the rescan
item only.

## 9. Behaviour on serif

- **Routes.** New `/api/scanner/v1/…` (§6), device auth only, CSRF-exempt
  because there are no cookies. New portal route `/j/<job_id>`: login
  required, redirects to `/scan/jobs/<job_id>/workspace/`. Existing
  `<uuid:job_id>` routes accept both ID formats (a path converter matching
  UUIDs and §4.1).
- **Model.** `ScanJob.id` becomes `CharField(primary_key, max_length=64)`.
  A migration converts existing UUIDs to their string form, including every
  foreign key (`ScanPage`, `ScanTodo`, `ScanTailorStageState`, review and
  processing tables) and `scan_job_id` values inside JSON detail fields.
  Web-created jobs get `str(uuid4())`. New: `ScannerDevice`, job fields
  `scan_started_at`, `page_width_mm`, `page_number_crop`, completeness
  flags, state `captured`; versioned scan covers; versioned OPF; stored
  event lines (`origin`, `line_no`, raw text, received_at).
- **Attribution.** A device-uploaded version has `uploader = NULL` and
  `device = <ScannerDevice>`. The device's jobs have `operator = NULL`;
  sans has no user login.
- **Portal.** Scans in `captured` are listed under "Raw scans", with title
  from the OPF, page count, completeness flags and open rescans. They are
  absent from library browse, search and download.
- **Observability.** Prometheus counters:
  - `scanner_api_requests_total{endpoint,status}`
  - `scanner_bytes_received_total`
  - `scanner_jobs{state}`
  - `scanner_last_seen_timestamp{scanner_id}`

## 10. End-to-end acceptance (both sides together)

1. **Happy path.** Scan a book with serif reachable. Pages appear on serif
   while scanning. After Finish Book, the QR code opens the job page (after
   login) showing "Raw scan" with the OPF title. All checksums match.
   Nothing appears in the library until ScanTailor processing and finish.
2. **Offline.** Unplug the Pi's network before Start, scan a book, finish it
   (QR code labelled "in progress"), and reboot the Pi. Reconnect: the job
   uploads on its own while idle, and the idle count drops to zero.
3. **Interruption.** Kill the network mid-page-upload, then restore it.
   There are no duplicate versions on serif, and capture-complete verifies.
4. **Retention.** Fill `data_root` until free space is below the required
   amount. Starting a new book deletes only the oldest confirmed job,
   silently. An unconfirmed job is never deleted.
5. **Auth and TLS.** A revoked key gives the "rejects key" status and no
   data loss. A wrong CA file gives "certificate not trusted". A session
   cookie cannot reach `/api/scanner/v1/`, and the device key cannot reach
   `/library/`. A TLS 1.2-only client cannot connect.
6. **Clock.** With NTP unsynchronised, sans refuses to start a book.
   Registering an existing job ID with another `scan_started_at` returns
   `409`.
7. **Rescan.** Flag a page of a `captured` job in the portal. It appears in
   sans's on-device list. The replacement upload creates version 2, keeps
   version 1, completes the todo, and appends `rescan_flag` then
   `rescan_replace` to `scan.jsonl`. Repeat on a `complete` job: it returns
   to `captured` with "re-finish needed".

## 11. Implementation tickets

- **sans:** see `libreflip/sans` `docs/serif-client.md` and the issues
  linked there (libreflip/sans#77, #78, #79, plus #47–#56).
- **serif:** implemented in c-base_book-scanner. Its ticket set is tracked
  in libreflip/serif#38.
