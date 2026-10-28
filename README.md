# AciesDaily portal

The separate AciesDaily portal for creatives, clients and staff. The public website lives beside it in `../studio`. Both use Next.js 16.4, React 19 and self-hosted Geist. The portal keeps the Acies ivory, slate and orange identity with a phone-first layout and bottom navigation for creatives and clients.

## Included

- Phone-first registration, optional email, personal passwords, phone verification, recovery, revocable server sessions and account ownership checks.
- Creative profiles with multiple crafts, private portfolio uploads, availability and unavailable dates, optional role-specific information, application review and separate publishing permission.
- Private invitations with a proposed fee and terms, availability responses, staff booking confirmation, call details, coordinator instructions, work uploads and recorded payment status.
- In-app notifications and private conversations with the team. Messages refresh while the conversation is open; SMS verification uses the configured provider. WhatsApp links prepare text but do not send it automatically.
- Individual staff accounts, owner-only staff invitations, client invitations, enquiries, application reviews, production management, proposals, content publishing and an activity record.
- Client accounts linked to their own projects, proposals, explicit approvals, updates and deliverables. Existing private project links still work without an account.
- Actual image uploads: JPG/PNG/WebP files are checked, resized, stripped of metadata and saved as WebP. Project uploads can also be PDFs. Files are private unless explicitly published or shared as project deliverables.

The portal does not transfer money. Payment status is a staff-entered record, with a transaction reference required when marking a fee paid. No demo bookings or client work are created. Labelled demo accounts are provisioned only by the explicit Neon setup and stay private.

## Local setup

From this directory:

    npm.cmd install
    node scripts/setup-local.mjs
    npm.cmd run dev

The portal serves at `http://127.0.0.1:3001`; `http://localhost:3001` also works for local forms and login. Run `npm.cmd run dev` in `../studio` for the public website at `http://127.0.0.1:3000`. Local aliases must use the configured protocol and port. Production forms require the exact configured portal origin. Stay on one address after signing in because cookies belong to that hostname.

Setup writes private `.env.local` files for both applications, a local owner account and `.data/owner-access.txt` containing the local owner login. It preserves existing credentials and copies legacy website enquiries/content without overwriting portal records or deleting website originals. Local owner provisioning is an explicit administrative bootstrap, not an SMS verification event.

Local phone verification is enabled only with `ACIES_OTP_MODE=local`, `ACIES_ALLOW_LOCAL_VERIFICATION=true` and loopback request/configured hosts. Codes go to private `.data/local-codes`, expire in five minutes, allow five attempts and are never returned by the API. The UI clearly identifies local preview delivery. No SMS is sent in this mode.

Production builds:

    npm.cmd run build
    npm.cmd start

## Neon PostgreSQL

Set the server-only `DATABASE_URL` in `.env.local` and run `npm.cmd run db:setup`. The connection uses [Neon’s official HTTP driver](https://neon.com/docs/serverless/serverless-driver) with parameterised SQL. It is never copied into the public website or browser bundle.

Neon stores portal records, account password hashes, sessions and private upload bytes in the private `acies_portal` schema. The setup is additive: local business records and uploads are copied without overwriting existing database rows. QA records and transient local sessions/challenges are not imported. File access still goes through the portal’s ownership and publication checks.

The setup creates a private `.data/account-credentials.txt` file with the owner login and role-specific demo logins. Demo numbers use the [reserved fictional 555-0100–0199 range](https://www.nanpa.com/numbering/555-line-numbers), never receive verification messages and cannot publish public profiles. Demo logins work only with `ACIES_ALLOW_DEMO_ACCOUNTS=true`; leave this off on a public deployment. Existing credentials and records are preserved on repeated setup runs.

The original local storage and optional Supabase adapter remain available when `DATABASE_URL` is empty. QA preview scripts explicitly clear `DATABASE_URL`, Supabase settings and SMS credentials. `npm.cmd run db:verify` checks the real configured Neon connection and the saved accounts using a local preview.

## AciesDaily Learn

Creative accounts have a mobile-first Learn area at `/learn`; staff manage it at `/team/learn`. The free model foundations programme starts with 12 lessons, four credited YouTube tutorials and four private photo/video assignments. Lesson completion and practice review are separate records and do not imply professional accreditation, profile approval or a guaranteed booking.

Run `npm.cmd run learn:setup` once for an existing Neon installation. This transaction adds the three learning collections and inserts starter lessons without replacing existing lessons or business records. New installations also support the collections through `database/neon-schema.sql`. Local storage uses the same private adapter; Supabase installations should rerun their schema upgrade before enabling learning.

Staff can add lessons, change their order, edit original notes/checklists/tasks, replace video links, save drafts and publish. Supported video sources are YouTube links or direct HTTPS MP4/WebM URLs for your own licensed training videos. YouTube's official privacy-enhanced player loads only after a learner chooses it; creator credit, YouTube terms, Google privacy links and a fallback watch link remain visible. An iframe-specific `strict-origin-when-cross-origin` referrer policy provides the referrer YouTube requires without sending private portal paths. External videos can carry ads, change or become unavailable. No video is downloaded, rehosted or represented as Acies-owned content.

Practice images and short MP4/WebM clips are uploaded privately, up to 8 MB per file and four files per attempt. Photos receive the normal metadata-stripping/resizing treatment; videos receive container/type checks and retain their original bytes. Learning files are marked separately, cannot be attached to a public creative profile, and are excluded from public media access even if a content entry links to them. Other creatives, clients and anonymous visitors cannot access them. Staff feedback includes the reviewer's name, a concrete next step and a separate practice outcome. Earlier attempts remain available; only one awaiting-feedback attempt is allowed at a time, and stale staff reviews are rejected. Learners receive an in-app notice when feedback is ready. No SMS or email is sent.

The starter sources are The Agency Arizona's [walk](https://www.youtube.com/watch?v=vxULs-R7Jl4) and [practice](https://www.youtube.com/watch?v=444j45QH3ns) tutorials, Fresh Pepper's [digitals tutorial](https://www.youtube.com/watch?v=4fAUaZS2TcE), and Brandon Andre's [digitals example](https://www.youtube.com/watch?v=wZwUdn3Ty2Y). YouTube metadata and embed availability were checked during setup. Acies notes are original; the referenced international resources are not Ghanaian legal templates or endorsements. Staff should review source suitability over time and replace material as needed.

Start `node scripts/preview-learning.mjs` after a production build, then run `npm.cmd run test:learn` in another terminal. The API checks refuse a preview without test mode and reset only their dedicated learning QA records. `node scripts/verify-learning-browser.mjs` then checks the mobile learner/staff experience in installed Chrome or Edge. The preview disables Neon, Supabase and SMS; reports are written to ignored `artifacts`.

## Production configuration

1. Set the final HTTPS `ACIES_PORTAL_URL` and `ACIES_SITE_URL`. Put the same random `ACIES_BRIDGE_SECRET` of at least 32 characters in the portal and website environments. Put a separate random `ACIES_VERIFICATION_SECRET` of at least 32 characters in the portal only.
2. Set `ACIES_OTP_MODE=twilio` and `ACIES_ALLOW_LOCAL_VERIFICATION=false`. Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. Configure the sender and destination permissions with the provider and verify actual Ghana delivery before launch. Registration does not silently bypass verification when delivery is unavailable. See the [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource).
3. For Neon, set `DATABASE_URL`, run `database/neon-schema.sql` through `npm.cmd run db:setup`, and configure real accounts before launch. Records and private uploads are durable in PostgreSQL. Do not enable demo logins publicly. Alternatively, a persistent single-process Node host can use `ACIES_STORAGE_DIRECTORY` on a private persistent disk. For serverless/multiple instances, run `database/schema.sql` and configure both Supabase variables plus a private `acies-private` storage bucket. The schema upgrades the old records table in place with a revision column and additional collections. The service-role key stays server-side; public website access is limited to published content and an authenticated enquiry-creation endpoint. See [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api).
4. Provision an owner using private environment variables `ACIES_OWNER_PHONE`, `ACIES_OWNER_NAME` and optionally `ACIES_OWNER_PASSWORD`, then run `node scripts/provision-owner.mjs`. Verify that the owner controls this number first. The script inserts an account without overwriting an existing identity and writes credentials to an ignored private file. Invite other staff through Account invitations.
5. Migrate existing private records before switching live traffic. Local setup copies local files only. When switching to Supabase, explicitly import the existing JSON records into `acies_records` with their original collection, ID and data; preserve project access tokens and account IDs. Copy local upload objects to the private bucket with their existing storage keys. Do not switch storage adapters without transferring live data.
6. Configure host-level request/body limits and rate limiting, monitoring, private backups and your final retention policy. Application authentication limits are persisted, but edge limits are still needed against traffic floods. Use a managed authentication provider if you need enterprise SSO or MFA; these are not included in this initial account system.

The Supabase and Twilio integrations are implemented but have not been connected to live credentials or verified against a live account. Do not deploy the development owner credential file or local verification settings. Private data and secrets are excluded from Git and output tracing.

## Ownership and access

Creatives can read/edit their own profile, invitations, messages and files. Only confirmed/completed project assignments allow work uploads. A response to an invitation does not confirm a booking. Staff review applications and confirm bookings. Public publishing requires staff action and creative permission; withdrawing permission immediately hides a linked public profile and its images. Casting details, equipment notes, contact details and availability are not included in public profile output.

Clients can read only projects explicitly linked to their accounts. Private links use random access tokens in URL fragments, sent to APIs as Authorization headers. A project reference alone cannot retrieve it. New proposal terms clear prior approval, and stale approvals are rejected. File links from private project pages are checked against the actual shared deliverables. Anyone holding a complete private project link can view and approve that project; share it only with the client. A compromised legacy link can be revoked by replacing its private record's `accessToken`.

Phone changes and self-service account deletion are not included; contact AciesDaily for those requests. Acknowledgements and activity records support coordination and are not an electronic-signature service or accounting ledger.

## Verification

Build and lint both projects. The integration/browser scripts use isolated local records and refuse a preview without test mode. They do not send SMS or use a remote database.

    node scripts/setup-qa.mjs
    node scripts/preview-qa.mjs

In another terminal, from this directory:

    node scripts/preview-qa.mjs --site

Then:

    npm.cmd run test:api
    npm.cmd run test:browser

The API checks create isolated test accounts in `.data/qa-run`. Browser checks cover creative registration/review/invitation/booking/upload, staff actions, client approval, old-link migration, responsive sizes, light theme and reduced motion using installed Chrome or Edge. Reports and screenshots are in ignored `artifacts`. The public site's existing video/form/responsiveness checks can be run from `../studio` using `node scripts/verify-site.mjs --url=http://127.0.0.1:3002` while both QA previews are running. Stop QA previews before running the normal portal on port 3001.
