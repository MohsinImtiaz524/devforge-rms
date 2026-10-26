Build this as a shared **Files module** backed by Cloudflare R2, with one configurable **`FileUpload` component** used throughout RMS. Each feature supplies a purpose, such as announcement attachments or employee documents; the shared pipeline handles uploading, validation, storage, previews, access, and cleanup.

This is the complete proposed plan. Repository tools failed to start, so existing code and paths remain unverified, and I couldn’t save it to a file. Suggested destination: `plans/upload-pipeline.md`. Keep `plans/announcement.md` focused on announcements and reference this shared plan from it.

**1. Scope and architecture**

Create three reusable layers:

| Layer | Responsibility |
|---|---|
| Shared frontend component | File selection, drag and drop, previews, progress, retry, removal, accessibility |
| Files backend module | Permissions, purpose policies, upload sessions, verification, attachment lifecycle, downloads |
| R2 storage adapter | Signing, reading metadata, reading objects, copying verified objects, deleting objects |

Business modules retain ownership of their records and permissions. For example, Announcements decides who may edit an announcement; Files handles its attachments through an explicit integration contract.

Avoid placing announcement, employee, or payroll logic inside the upload component or R2 adapter.

**2. Use a purpose-based policy registry**

Define upload rules centrally on the server:

```ts
type UploadPurpose =
  | "announcement.attachment"
  | "employee.avatar"
  | "employee.document"
  | "company.logo";
```

Each purpose declares:

- Allowed file types and detected content types.
- Maximum file size, number of attachments, and total attached bytes.
- Image dimension limits and whether processing is required.
- Permission checks for uploading, attaching, viewing, and removing.
- Whether multiple records can share a file.
- Retention and deletion rules.

The frontend receives a safe projection of these policies for instructions and early validation. Server rules remain authoritative.

Proposed initial defaults, subject to business requirements:

| Purpose | Allowed formats | Size per file | Count per record |
|---|---|---:|---:|
| Announcement attachments | JPEG, PNG, WebP, PDF | 10 MB | 5 |
| Employee avatar | JPEG, PNG, WebP | 5 MB | 1 |
| Employee documents | PDF, JPEG, PNG | 10 MB | 10 |
| Company logo | JPEG, PNG, WebP | 5 MB | 1 |

Add Office documents through explicit policies when needed. Initially exclude SVG, HTML, executables, archives, and macro-enabled documents.

**3. Upload directly to private R2 staging storage**

Use authenticated backend endpoints to issue short-lived presigned PUT URLs. The browser sends bytes directly to R2, then asks the backend to verify the upload.

Cloudflare supports this approach through its S3 API. Browser uploads require bucket CORS configuration; presigned URLs use the R2 S3 endpoint rather than a custom domain. [Cloudflare presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

```text
User selects files
        ↓
Frontend performs preliminary validation
        ↓
Backend checks session, tenant, purpose, permissions and quota
        ↓
Backend creates upload session and signs a staging PUT
        ↓
Browser uploads directly to R2
        ↓
Backend verifies and processes the staged object
        ↓
Verified bytes are stored under a separate final object key
        ↓
File becomes ready
        ↓
Business record saves and attaches file IDs in one DB transaction
```

Staging and final objects must use different keys. A presigned PUT remains usable until expiry, so the system must not expose a verified file whose bytes can subsequently be overwritten through that URL.

Verification should read a bounded object into an immutable processing snapshot, validate those bytes, and publish that same snapshot to the final key.

**4. File lifecycle**

Use explicit statuses:

```text
pending → verifying → ready
                    → rejected
pending → expired
ready   → deleting → deleted
```

Attachment status is separate: a ready file can temporarily exist without belonging to a saved record.

Rules:

- Only ready files may be attached or downloaded.
- Finishing the R2 PUT does not mean the file is ready.
- Completion requests are idempotent.
- A cancelled form leaves an unattached file for scheduled cleanup.
- Replacing a file preserves the original until the record saves successfully.
- Removing an attachment from a form does not immediately delete storage.
- Failed operations have recoverable states and bounded retries.

**5. Database model**

Use the existing database conventions and tenant identifier once verified.

| Table | Main fields |
|---|---|
| `files` | ID, tenant ID, uploader ID, purpose, original filename, detected MIME type, verified byte size, checksum, dimensions, final storage key, status, timestamps |
| `file_upload_sessions` | ID, file ID, staging key, expiry, expected size/type, status, idempotency key, retry/error metadata |
| `file_attachments` | ID, tenant ID, file ID, resource type, resource ID, slot, display order, attached-by user, timestamps |
| Durable jobs/outbox | Verification, cleanup and deletion tasks with attempts and next retry time |

Constraints and indexes:

- Unique storage keys and scoped idempotency keys.
- Tenant-scoped lookups and resource attachment indexes.
- Prevent duplicate attachment links.
- Enforce single-file slots, such as avatars, transactionally.
- Prevent cross-tenant file associations at the database level where supported.
- Track actual verified size separately from client-declared size.

A generic `resource_type/resource_id` association cannot provide ordinary foreign keys to every business table. Use registered resource resolvers and transactional validation; use dedicated join tables where stronger relational guarantees are needed.

Store file IDs in business data. Never persist expiring signed URLs as attachment references.

**6. Backend interfaces**

Proposed endpoints:

| Endpoint | Responsibility |
|---|---|
| `GET /api/files/policies/:purpose` | Return permitted client-facing rules |
| `POST /api/files/upload-sessions` | Authorize and reserve an upload; return file ID, session ID, PUT URL, required headers and expiry |
| `POST /api/files/upload-sessions/:id/complete` | Start idempotent verification |
| `GET /api/files/:id` | Return authorized metadata and processing status |
| `POST /api/files/:id/download-url` | Authorize access and return a short-lived download URL |
| `DELETE /api/files/upload-sessions/:id` | Cancel an upload and schedule cleanup |

Record creation and update endpoints accept attachment file IDs. They call an exported Files service within the business transaction.

Suggested module API:

```ts
files.validateForAttachment(context, fileIds, purpose);
files.syncAttachments(transaction, context, resource, fileIds);
files.listAttachments(context, resource);
files.authorizeDownload(context, fileId);
files.scheduleUnreferencedDeletion(transaction, fileId);
```

Do not expose a generic “attach to any table” endpoint.

Use consistent errors such as `FILE_TOO_LARGE`, `TYPE_NOT_ALLOWED`, `UPLOAD_EXPIRED`, `FILE_NOT_READY`, and `ATTACHMENT_LIMIT_EXCEEDED`.

**7. Shared frontend component**

Provide one public component backed by a shared hook and API client:

```tsx
<FileUpload
  purpose="announcement.attachment"
  value={attachments}
  onChange={setAttachments}
  disabled={saving}
/>
```

The controlled value contains stable file IDs, display metadata, and upload status. Keep transient `File` objects and transport details inside the upload hook.

Supported behavior:

- Single and multiple file selection.
- Drag and drop with keyboard-accessible alternatives.
- Image thumbnails and document cards.
- Per-file progress, cancellation, retry, and errors.
- Existing attachment display, removal, and replacement.
- Processing state after transfer completes.
- Mobile file picker support.
- Clear limits and readable error messages.
- Object URL cleanup when previews are removed or unmounted.

Use a shared upload queue with a proposed limit of three concurrent transfers. Use a transport that supports upload progress, such as XMLHttpRequest.

Disable form submission while newly selected files are uploading or verifying. Preserve successful uploads when another file fails.

Visual variants such as avatar, compact, and attachment list reuse the same engine. If legacy pages still require uploads, provide a thin adapter over the shared client and policies; verify the existing frontend structure before choosing that adapter.

**8. Validation and access control**

Apply checks at each boundary:

- Derive tenant and user identity from the authenticated session.
- Require purpose-specific permission before issuing upload credentials.
- Use existing CSRF protection on authenticated mutation endpoints.
- Recheck record permissions and tenant ownership when attaching.
- Check access to the parent resource before issuing download URLs.
- Keep unattached files accessible only to authorized upload owners.
- Never accept client-provided buckets or storage keys.
- Generate opaque object keys without personal information.

Verification must inspect actual bytes, not trust filename extensions or uploaded MIME metadata:

- Check actual object size.
- Detect file signatures.
- Decode images and enforce pixel/dimension limits.
- Re-encode image formats where appropriate and strip sensitive metadata.
- Validate document structure and scan documents for malware before release.
- Bound processing memory, execution time, and decompressed content size.
- Treat unscannable or password-protected documents according to an explicit policy.

Client checks improve feedback but do not enforce security. A declared size or ordinary presigned PUT does not establish a trustworthy upload-size limit. Enforce reservation quotas and verify actual bytes afterward; use a bounded upload gateway if strict limits before storage ingestion are required.

**9. R2 setup and delivery**

- Private buckets, separated by environment.
- Server-only credentials with the minimum required bucket permissions.
- Exact allowed frontend origins in CORS.
- Only necessary methods and headers.
- Matching signed and uploaded `Content-Type` headers.
- Short upload and download URL expirations.
- No public access to private documents.
- No signed URLs or credentials in application logs.

Configure CORS against the actual upload headers and expose response headers only when the client needs them. [Cloudflare CORS documentation](https://developers.cloudflare.com/r2/buckets/cors/)

Serve documents as downloads with sanitized filenames. Permit inline image display only for verified supported formats. Private download URL responses should avoid shared caching.

Authorization changes prevent new signed URLs from being issued; previously issued URLs remain usable until expiry. Choose a short expiry, or use an authenticated delivery proxy for resources requiring immediate revocation.

**10. Cleanup, consistency, and operations**

R2 operations and database transactions cannot commit atomically. Use durable jobs and compensating actions:

- Publish a verified final object before marking the file ready.
- Reconcile objects created when a later database update fails.
- Commit attachment changes and deletion jobs together.
- Recheck references before deleting a final object.
- Serialize attachment and deletion operations to prevent races.
- Retry failed R2 deletion without losing the database record.

Proposed cleanup defaults:

- Expire unused upload sessions after 15 minutes.
- Remove abandoned staging objects after 24 hours.
- Remove ready but unattached files after 24 hours.
- Apply business-specific retention before deleting formerly attached files.

Enforce request limits, pending-upload limits, storage quotas, and reserved-byte accounting per tenant. Monitor upload success, verification latency, rejection reasons, cleanup backlog, and storage consumption.

Keep private attachment responses out of shared PWA caches. Define offline behavior explicitly: initial uploads require connectivity.

**11. Implementation phases**

| Phase | Work | Completion condition |
|---|---|---|
| 1. Repository discovery | Inventory upload endpoints, components, schemas, R2 configuration, permissions and legacy consumers | Confirmed integration map |
| 2. Shared foundation | Files module, migrations, policies, R2 adapter, configuration validation | Stable service contracts |
| 3. Reliable pipeline | Upload sessions, verification worker, immutable final objects, quotas, cleanup | Complete lifecycle works |
| 4. Shared UI | Component, hook, client, previews, progress, cancellation and retry | Single and multiple upload flows work |
| 5. First integration | Announcement attachments, assuming that feature needs them | Record save/edit/remove works transactionally |
| 6. Incremental migration | Avatars, employee documents, logos and other consumers | Each migrated feature uses shared infrastructure |
| 7. Release verification | Security, failure recovery, mobile, PWA, production build and staging R2 checks | Acceptance criteria pass |

Preserve existing endpoints until each consumer migrates. Use feature flags for rollout. Do not rewrite existing attachment data until its current structure and access behavior are understood.

**12. Verification and acceptance criteria**

Test meaningful boundaries:

- Valid image and document uploads, previews, and downloads.
- Cross-tenant upload, attachment, metadata, and download attempts.
- Forged MIME types, oversized objects, corrupt images, and rejected documents.
- Expired URLs, interrupted transfers, cancellation, and retries.
- Duplicate completion requests and repeated form submissions.
- Attempts to overwrite staging objects after verification.
- Failed database writes, R2 failures, and worker restarts.
- Attachment replacement, concurrent deletion, and abandoned-form cleanup.
- Keyboard, mobile, and existing frontend compatibility.
- Actual browser CORS behavior against a staging R2 bucket.

The work is complete when a new feature can enable uploads by registering a purpose policy, rendering `FileUpload`, and saving returned file IDs through the shared attachment service—without adding its own storage, transport, validation, or cleanup implementation.