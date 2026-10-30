# Operating AciesDaily

## Launch and pilot

1. Use `docs/admin-separation.md` for the compatible portal/website rollout. Build and run isolated API/browser tests first. Never run synthetic QA against production.
2. In mNotify, approve AciesBms for OTP with the real portal URL. Test verification and recovery with a consenting number after approval. Do not bypass phone verification while waiting.
3. Publish only genuine profiles with creative consent and approved, credited work. Suggested pilot content: 10–15 profiles and 2–3 work examples. Those are operating targets, not existing content or market claims.
4. Use Follow-ups & progress each day. Contact new leads, review applications and confirm accepted invitations. Record Contacted after responding; updating a status does not send a message.
5. Check upcoming scheduling warnings. Confirmation checks declared unavailability and existing same-day confirmed bookings. A staff override needs a specific reason and is audited. Checks are advisory coordination controls, not an atomic reservation system across concurrent server instances.

## Metrics

Pipeline counts represent current statuses. Proposal approvals and booked/progressed counts are separate. First-contact response times use only explicit Contacted milestones recorded after this release. Older dates are not invented. Milestones are preserved if a status is revisited. No external analytics service receives private records or token-bearing URLs.

Ask each pilot client how they found AciesDaily and why they accepted/declined a proposal. Record only the information needed for coordination. Use observed drop-offs to decide the next feature.

## Files

New uploads are limited to 4,000,000 bytes; the multipart request cap is 4,200,000 bytes. This leaves headroom below the hosting request limit. Existing larger files are preserved. Use short, lower-resolution practice videos or separate licensed delivery links. For future direct private uploads, keep the ownership/publication checks, validate the completed file and migrate existing bytes additively.

## Recovery

Run `npm run db:backup` from the dashboard to export a consistent read snapshot of records and files into ignored `.data/backups`. It does not alter the database. Exports contain private records and password hashes: restrict access, encrypt any off-device copy, and never commit or attach them to tickets. The export is intended for this small installation; use provider-native recovery/pg_dump for larger databases and validate query/response limits before scheduling it at scale.

Confirm the actual Neon restore-history window in its console. Practice recovery into an isolated branch; never overwrite production to test a backup. Restore the schema first, then record rows with their original collection, ID, revision and timestamps and file rows with their original keys/base64-decoded bytes. Check collection counts, account/project IDs, file sizes and ownership behavior before routing traffic. Deletion requests must also be considered when restoring older backups. No automated destructive restore is included.

## Incident handling

For a 503, capture the returned request ID and find its sanitized event/code in Vercel logs. Never log connection URLs, raw SQL, passwords, OTPs, cookies or private links. Run `node scripts/check-production.mjs` for public routes and the authenticated storage check. Configure independent uptime/error alerting and review platform rate limits; this code does not purchase a monitoring service or claim that external alerts are active.

Replace a compromised project link using the staff project editor. The old token stops working immediately and the replacement is audited. Share the new complete link only with the intended client. Proposal approval remains a separate record; changing the link does not silently approve or unapprove terms.

## Privacy and account requests

The operator must approve a retention schedule, verify Ghana DPC obligations and choose a request-handling owner. For correction/deletion requests, verify account ownership, locate related profiles, projects, media and learning records, assess retention obligations, and record the decision privately. Remove public publication permission when appropriate; do not expose private data in support correspondence. Do not promise automated deletion, legal compliance, provider regions or a retention period that has not been established.

## Payments

Current Paid status is a manual record, not a funds transfer. A future deposit integration requires merchant onboarding, explicit client payment terms, verified signed webhooks, amount/currency/reference checks, idempotency, reconciliation and refund handling. Do not activate live payments or automated creative payouts without those business decisions and provider credentials.
