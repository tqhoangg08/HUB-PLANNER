# Event candidate image ingest protocol

The browser extension source is checked in under
`extension/hub-planner-event-collector`. The existing
`POST /api/event-candidates` JSON contract remains compatible; an old extension
can still submit a candidate without an image. Its external `image_url` is not
treated as durable storage.

To request automatic download of a publicly accessible image, the extension
must add all three fields to the existing JSON body:

- `image_url`: HTTPS URL on the narrowly allowed public Facebook image CDN;
- `image_rights_confirmed: true` only after the extension has obtained an
  affirmative, per-image permission/rights confirmation;
- `image_rights_basis`: `owned`, `licensed`, or `permission`.

The ingest response contains the canonical `candidate.id` and an
`image_ingest_status` of `pending`, `stored`, `failed`, `manual_required`, or
`missing`. A candidate is saved even when image processing fails. The Worker
does not use Facebook cookies, tokens, or redirect-following to fetch images.
An attestation is not proof of licensing; the extension UX and operator must
ensure the selected basis is truthful.

The extension can poll `GET /api/event-candidates/{id}/image-status` with its
existing ingest bearer credential. This returns only the storage state and a
boolean confirming that the D1 reference points to an R2 banner; it never
returns candidate text, source URL, or student data. The popup says an image
was saved only after this check or a successful binary upload response.

If the Worker cannot fetch the public image but the extension has a lawful
binary copy, it may send `POST /api/event-candidates/{id}/image` with the same
ingest bearer credential, a raw JPEG/PNG/WebP body of at most 2 MB, and the
headers `X-Image-Rights-Confirmed: true` and
`X-Image-Rights-Basis: owned|licensed|permission`. This endpoint stores only
the binary in R2 and its non-guessable banner URL in D1. It will not replace
an existing R2 banner or modify a reviewed candidate. The extension must not
transmit a binary it lacks the right to store.

The staff review UI displays image ingest status and retains its manual banner
upload fallback. Approval continues to copy the selected candidate R2 URL to
the admin and public event. No raw source image is placed in D1.

The extension source is checked in under `extension/hub-planner-event-collector`.
Its deployable unpacked copy is maintained separately in the user's OneDrive
folder. Deploying the Worker does not reload or update an unpacked extension.
