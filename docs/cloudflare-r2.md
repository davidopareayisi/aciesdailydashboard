# Private Cloudflare R2 uploads

The intended bucket is `dailyacies`. The endpoint is the account's HTTPS S3 endpoint; the account ID and endpoint identify the account but do not authenticate requests.

## Production setup

In Vercel's `aciesdailydashboard` project, set these server-only Production variables using raw values without surrounding quotes:

- `R2_ACCOUNT_ID`: the Cloudflare account ID.
- `R2_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com` (optional when it matches this default).
- `R2_BUCKET_NAME`: `dailyacies`.
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: an R2 S3 token with Object Read & Write access restricted to this bucket. Use Secret variables. A general Cloudflare API token is not a substitute for this pair.
- `ACIES_MEDIA_STORAGE=r2`: enable new uploads only after credentials and bucket privacy are verified. `database` preserves the existing upload destination.

Keep the bucket private: disable its public development URL and do not attach a public custom domain to it. The application cannot guarantee private learning/project files if the bucket is independently exposed. Browser uploads require the restricted CORS rule installed by `node scripts/configure-r2-direct.mjs`; the bucket remains private. Do not publish tokens, private objects or credential files.

After updating variables, deploy the dashboard. The authenticated `/api/bridge/status` readiness check makes a read-only HeadBucket request when R2 is selected; failures return a sanitized R2 code. This proves connectivity/bucket access, not upload permissions. For a complete put/read/delete test, set the same private variables in an ignored local environment and run `npm run storage:verify -- --roundtrip`. The script creates and removes only its own randomly named `_acies-checks` object; it never lists or changes existing objects.

## Storage behavior

Neon still holds accounts, projects and media metadata. New R2 objects use `portal/<random-id>.<extension>`. Metadata records their provider and bucket so existing Neon files continue to use their original reader. No existing bytes or URLs are migrated or removed. Preserve the existing bucket and account credentials if changing the default destination later.

All downloads still pass through the portal's ownership, shared-deliverable and publication checks. After access is allowed, the portal redirects to a signed R2 download URL valid for 60 seconds (15 minutes for video playback). An issued link remains usable until it expires, including after consent withdrawal. Video range requests go directly to R2. Practice images/videos remain private even if referenced by published content. Images still receive resizing and metadata stripping before storage.

Production browser uploads go directly to R2: images and project PDFs up to 10 MB; private learning MP4/WebM videos up to 100 MB. The dashboard issues a 10-minute PUT URL signed for exact size, MIME and SHA-256 checksum. Finalization rechecks ownership/project permission, size, checksum and file signatures; images are decoded, resized and stripped of metadata. Video checking identifies the container signature, not codec correctness or full content scanning. Only verified objects receive media records. Staging objects in `pending/` expire after one day; expired local metadata is cleaned in batches on subsequent uploads by that user. Legacy multipart uploads and non-R2 development environments retain the 4 MB limit. Failed uploads can be retried by selecting the file again.

Apply `node scripts/migrate-direct-upload.mjs` before deploying to allow the pending-upload collection. Run `node scripts/configure-r2-direct.mjs` once for CORS and the staging lifecycle rule; it preserves other rules.

Run `node scripts/verify-direct-upload.mjs` against the isolated R2 preview to verify the direct flow, size/type rejection, ownership and a synthetic upload larger than 10 MB. Never use production business accounts for this test.

`npm run test:r2` runs offline transport/configuration tests without a real bucket. Isolated QA previews explicitly disable R2 credentials and select database/local storage so tests cannot write production objects.

Database snapshots now include R2 metadata but not R2 object bytes. Plan bucket recovery/export separately; a Neon snapshot alone cannot restore R2 objects. Failed metadata inserts attempt to remove only their newly created R2 object. Review orphan cleanup and retention as part of storage operations.

For an end-to-end integration test, build the dashboard, start `node scripts/preview-r2.mjs`, then run `npm run test:r2:api` in a second terminal. The preview disables production record stores and SMS, but uses the real configured R2 bucket. The test creates only synthetic local accounts and two random R2 image objects, verifies private/public-consent behavior and removes its own objects afterwards. Do not use this preview as a normal development server.
