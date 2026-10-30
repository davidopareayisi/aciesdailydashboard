# Website and portal deployment

`daily.acies.store` serves public pages, forwards public enquiry fields and reads published content. `apply.acies.store` owns accounts, private records, project references/access links, proposals, client approvals, creative responses, staff booking confirmation, payment records, deliveries, learning and publishing.

The public website has no admin sessions, staff password setup, database adapter or private project read/approval relay. `/admin` and nested old admin pages redirect to the portal. Old `/api/admin/*` and `/api/projects/:id` endpoints return `410 Gone`; API clients must use the portal directly. Old browser project links keep their private URL fragment when redirecting.

## Intake boundary

The website accepts bounded JSON at `/api/enquiries`, checks the website origin and forwards only the public form fields through the authenticated bridge. The portal revalidates name, phone, optional email, dates, services, portfolio and consent. It creates the reference, initial `New` status, timestamp and private project token. Incoming admin fields are not copied. Network enquiries do not create client project tokens or accounts.

An idempotency key identifies a submission attempt. An unchanged retry returns the same receipt and token; changed details require a new key. Concurrent inserts are protected by unique record identity in PostgreSQL and a per-key queue for the single-process local adapter. A receipt, a client proposal approval and a creative's availability response are separate from staff booking confirmation.

## Production settings

Set `ACIES_SITE_URL=https://daily.acies.store` and `ACIES_PORTAL_URL=https://apply.acies.store` in both Vercel projects. Set the same server-only `ACIES_BRIDGE_SECRET` in both. The dashboard alone needs the existing Neon `DATABASE_URL` and its verification/SMS settings. No secret uses a `NEXT_PUBLIC_` prefix. Environment changes require a new Vercel deployment.

Vercel deployments refuse the local file-storage fallback. Invalid database URLs receive the safe code `DATABASE_URL_INVALID`; missing durable storage receives `DATABASE_URL_MISSING`. Production errors log only an event, random request ID and safe code, without connection strings, SQL text, bodies, cookies or raw error messages. The public error includes its request ID for log lookup.

`GET /api/bridge/status` requires the bridge bearer secret and checks the same storage adapter/schema used for published content. It returns readiness and intake protocol version, never private records. `node scripts/check-production.mjs --portal-only` checks portal readiness; omit the flag after the website is deployed to verify both directions.

Useful log codes: `DATABASE_URL_INVALID` means the variable must contain the actual PostgreSQL URI, not the variable's name; `42P01` indicates a missing schema/table in the selected database or branch; `28P01` indicates rejected database credentials; `42501` indicates database permissions. Inspect the specific Vercel request ID before changing settings.

## Data preservation and rollout

1. Run `node scripts/archive-legacy-website.mjs` locally with the existing Neon environment. It writes private source/database snapshots under ignored `.data/migrations`, copies missing local website records and never overwrites conflicting rows. Its report explicitly distinguishes local originals from unverified remote website storage.
2. Inspect the old website's Vercel storage configuration before retiring its live admin deployment. Export and reconcile any remote records using their original IDs, timestamps and private access tokens. Do not assume local originals include later production submissions.
3. Build and deploy the dashboard first. Check its public content response and authenticated bridge readiness; resolve any 503 before routing website enquiries through it.
4. Configure the website's URLs and matching bridge secret, then deploy its public-only build. An old website bridge client must be upgraded with this intake contract; do not point an old record-generating bridge client at the new endpoint.
5. Test an explicitly labelled enquiry, staff visibility, private project link, proposal approval, creative acceptance, staff confirmation and published content. Confirm old admin URLs redirect and retired APIs cannot read or modify a private record.

## Isolated verification

Run `node scripts/setup-qa.mjs`, then `node scripts/preview-separation.mjs` and `node scripts/preview-separation.mjs --site` in separate terminals. These use ports 3105 and 3106 with remote storage and SMS disabled. Run `node scripts/verify-separation.mjs` for the intake and retirement checks.

The existing full portal API/browser checks accept `ACIES_TEST_PORTAL_URL=http://127.0.0.1:3105` and `ACIES_TEST_SITE_URL=http://127.0.0.1:3106`. The public browser checks accept the same portal variable and `--url=http://127.0.0.1:3106`. Verification reports and synthetic records remain ignored.
