# Shared image pipeline: announcement release

Status: application changes and local verification are complete for the images-only announcement release. Live staging R2/browser-CORS and PostgreSQL concurrency checks remain release gates. This document does not claim that production has been deployed or remotely verified.

## What is connected

Announcement artwork and optional image attachments use one shared Files engine when FILES_ENABLED=true. Artwork supports one JPEG, PNG, WebP or GIF up to 8 MiB. Attachment policies allow up to five JPEG, PNG or WebP images, 10 MiB each. PDFs, SVG, HTML, executables and other documents are not accepted by this pipeline in this release; no malware-scanner installation is needed for its current formats.

Existing artwork stays readable without a backfill. The editor uploads and waits for ready files before saving stable file IDs. Announcement creation/update, artwork replacement/removal and attachment links commit together. An omitted artwork_file_id preserves the current image; null explicitly removes it. Alternative text stays editable. Source metadata distinguishes legacy images from new files, so removing new artwork cannot resurrect an old image.

The old announcement multipart upload endpoint returns LEGACY_UPLOAD_DISABLED before buffering when the feature is enabled. Older clients must refresh to use the updated editor. When disabled, legacy editing remains available and existing pipeline artwork still loads through the authorized content endpoint. Rollback does not delete stored objects or tables.

Logos, avatars, staff documents and product-image storage have not been migrated to Files. Their existing business endpoints remain. Legacy product/logo uploads now reuse the same image normalizer before writing public image bytes. Receipt image URLs/descriptions are validated or escaped in browser and server-generated receipts; arbitrary product image_path updates cannot bypass upload validation. Existing receipt printing and background editing remain in place.

## Reusable boundaries

- files.policies.js is the central purpose registry: formats, size/count limits, dimensions, frame budgets, inline delivery and scope. The engine contains no announcement workflow logic.
- files.service.js owns sessions, immutable publication, quota accounting, attachment transactions, authorization dispatch, read models and cleanup.
- files.storage.js owns private R2 signing, bounded reads, writes and deletion; it knows no business module.
- files.verification.js and files.verify-worker.js decode/re-encode images in a separate child process with a deadline, a small processing queue, pixel/frame limits and stripped metadata. A child process contains decoder crashes; it is not an OS security sandbox or a guarantee against all decoder vulnerabilities. Keep Node/sharp/libvips patched and respect deployment memory limits.
- announcements.files.js supplies announcement edit/view resolvers. A future module registers its purposeAuthorizers and resource resolver with a fixed purpose and authorizeEdit/authorizeView, then renders FileUpload and calls syncAttachments in its own transaction. Tenant identities come from sessions. Composite foreign keys prevent cross-scope links. Unmigrated tenant purposes remain disabled.
- GET /api/files/:id/content checks the current parent-resource permissions, ready state, bounded size and checksum. It serves only verified allowed image types with private/no-store, nosniff and sandbox headers. Previews use stable authenticated URLs, not expiring signed URLs. Downloads use 60-second signed attachment URLs.

## Lifecycle and operations

Upload URLs last at most 15 minutes. Staging keys and final keys differ, so replaying a staging URL cannot overwrite a ready image. Reservation quotas account for staging plus worst-case normalized bytes, with aggregate queries under a scope lock. Direct presigned PUT does not impose a strict ingress-byte limit: oversized objects are rejected during bounded verification; a streaming upload gateway would be needed for a hard ingestion limit.

Files remain pending, verifying, ready, rejected, expired, deleting or deleted. Completion is idempotent. Durable jobs retry storage failures with bounded backoff. A savepoint protects retry accounting when SQL publication fails after an object write. Workers/attachment/deletion operations serialize on file rows. Storage calls are bounded but run while that row is locked; monitor database pool pressure and worker latency before increasing concurrency.

Ready unattached or detached files get a 24-hour grace period by default; attached files are retained. Staging deletion is scheduled after upload expiry plus 24 hours. Cancellation cannot delete an attached file. Rejected/expired and cancelled staging objects retain reservations until cleanup. A failed final deletion preserves the database state for retry. Monitor files.status, sum of verified_bytes, file_jobs.attempts, last_error and oldest due run_at. Exhausted jobs require controlled operator recovery after diagnosing the cause; never erase database rows to bypass failed deletion.

## Render Node configuration

Keep the existing Node deployment. R2 credentials belong in Render Environment, never Git or chat:

```env
FILES_ENABLED=false
R2_BUCKET_NAME=private-environment-bucket
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=server-only-value
R2_SECRET_ACCESS_KEY=server-only-value
```

The real .env and Render configuration have not been modified by this work. .env.example documents optional shared limits:

| Setting | Default |
| --- | ---: |
| FILES_MAX_PENDING_UPLOADS | 20 per scope |
| FILES_SCOPE_QUOTA_BYTES | 1073741824 |
| FILES_UPLOAD_TTL_SECONDS | 900 |
| FILES_UNATTACHED_RETENTION_HOURS | 24 |
| FILES_JOB_MAX_ATTEMPTS | 5 |
| FILES_WORKER_INTERVAL_MS | 5000 |
| FILES_IMAGE_CONCURRENCY | 1 per Node process |
| FILES_IMAGE_QUEUE_LIMIT | 4 |
| FILES_STORAGE_TIMEOUT_MS | 30000 |

Use private environment-specific buckets, least-privilege server credentials, and no public bucket domains. The actual frontend origin must be explicitly allowed in bucket CORS:

```json
[{"AllowedOrigins":["https://staging.example.com"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3600}]
```

Replace the origin with the exact website origin, without a path or wildcard. Signed and uploaded Content-Type must match. ETag exposure is unnecessary. See [Cloudflare presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and [bucket CORS](https://developers.cloudflare.com/r2/buckets/cors/).

When enabled at startup, configuration is validated, additive Files/announcement columns are installed in one database transaction, PostgreSQL startup migration is serialized with an advisory lock, and the durable worker starts. No request runs a migration. Staging and production must use PostgreSQL for release testing, not the SQLite development database.

## Verification commands and release gates

```text
npm test
npm --prefix frontend run build
node frontend/tests/files-upload-smoke.cjs
npm run files:check
npm run files:check -- --remote --origin=https://staging.example.com
npm run test:files:postgres
```

The ordinary files:check verifies configuration and native decoding without uploading bytes or changing data. --remote adds read-only bucket/CORS checks; credentials may need permission to read bucket metadata, otherwise verify CORS in Cloudflare rather than broadening object credentials automatically. It does not prove bucket privacy or actual browser preflight success.

The PostgreSQL test runs only with FILES_TEST_DATABASE_URL explicitly pointing to a disposable test database. It creates/drops a randomly named test schema and never falls back to production DATABASE_URL. If unset, the test is skipped; a skipped test is not evidence of PostgreSQL correctness.

The browser smoke test uses mocked API/storage responses and an installed Chrome channel (PLAYWRIGHT_CHANNEL can override it). It verifies processing blocks save, one-image replacement, stable IDs, existing preview, removal, mobile layout and feature rollback. Screenshots are temporary artifacts; this is not live R2 testing.

Before enabling production:

1. Run the PostgreSQL concurrency test against a disposable test database.
2. Deploy the code to staging with private staging R2 settings and FILES_ENABLED=true.
3. Verify real browser CORS/PUT, JPEG/PNG/WebP/GIF validation, corrupt/oversized rejection, current-image preview and signed downloads.
4. Verify draft denial and targeted-recipient access, replacement, explicit removal, concurrent edit conflicts, rollback and cleanup after expiry/grace periods.
5. Check memory usage on the actual Render instance and ensure the worker runs while uploads need verification/cleanup. The processing queue is deliberately small for modest Node instances.
6. Enable production only after those checks pass. This work performs no production upload, data rewrite or deployment.

Local tests include lifecycle/tenant boundaries, checksum verification, staging overwrite resistance, transactional rollback, SQL-after-object-write recovery, GIF budgets, metadata/payload removal, real multipart validation, receipt rendering safety, and existing RMS regression tests. Focused frontend lint passes; full lint also contains pre-existing ShiftDashboard.jsx set-state-in-effect errors. Dependency audit was patched without forced breaking upgrades; unused vulnerable packages were removed, preserving the existing local product image editor.

Shop logos are now integrated through `company.logo` / `shop.logo`. See [shop_logo_pipeline.md](shop_logo_pipeline.md) for the profile UI, legacy-logo compatibility, receipt sizing, and rollout checks.
