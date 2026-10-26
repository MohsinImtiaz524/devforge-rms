Shop types
  ✓ All shop types
  □ Restaurant
  □ Café
  □ Bakery
  □ Cloud kitchen

Audience
  ○ Everyone in those shop types
  ○ Selected roles
  ○ Selected permissions
  Yes, build the announcement MVP now before launching Expenses. Otherwise, you will finish the feature but lack a professional way to introduce it to customers.

Do not delay the Expenses release for advanced announcement analytics, email delivery, or complex campaign automation. Implement the launch-ready foundation first, announce Expenses, and extend it later.

# Platform Announcement System Plan

## 1. Product ownership

Announcements must be a separate business module:

```text
src/modules/announcements/
frontend/src/modules/announcements/
```

Do not store announcements as ordinary notifications.

The responsibilities are different:

- **Announcements:** product launches, maintenance notices, tutorials and platform news.
- **Notifications:** operational events such as cash-drop requests, stock warnings and approval requests.

Announcements may create notification indicators, but the announcement remains the authoritative record.

---

# 2. Publishing authority

## Phase 1

Only the **Super Admin** can:

- Create announcements
- Upload media
- Select audiences
- Preview
- Publish
- Schedule
- Edit drafts
- Cancel scheduled announcements
- Expire announcements
- Archive announcements
- Inspect delivery and readership

This is sufficient for launching the Expenses panel.

## Future phase

Restaurant Admins may publish shop-only announcements using:

```text
announcements.manage_shop
```

This should not be included in the first release unless immediately required.

---

# 3. Announcement lifecycle

Use explicit states:

```text
Draft → Scheduled → Published → Expired → Archived
```

Also allow:

```text
Scheduled → Cancelled
Published → Unpublished
```

## Rules

- Drafts are visible only to Super Admin.
- Scheduled announcements become visible at `publish_at`.
- Published announcements remain visible until `expires_at`.
- An announcement without an expiry remains active until manually expired.
- Archived announcements remain available in platform history.
- Published announcements must never be hard-deleted.
- Editing a published announcement must create an audit event.
- Significant corrections should increment a version.

---

# 4. Announcement content

Each announcement should support:

- Internal title
- Public headline
- Short summary
- Full description
- Announcement type
- Cover image or animated GIF
- Publication date and time
- Expiration date and time
- Call-to-action label
- Call-to-action destination
- Priority
- Display style
- Audience
- Created by
- Last edited by

## Announcement types

```text
Feature launch
Product update
Maintenance
Important notice
Training
Promotion
Security notice
```

## Priority

```text
Normal
Important
Critical
```

Priority controls placement, not authorization.

## CTA example for Expenses

```text
Label: Explore Expenses
Destination: /app/expenses
```

Only safe internal application paths should be accepted in Phase 1.

---

# 5. Safe content rules

Do not allow unrestricted HTML.

Use:

- Plain text, or
- Sanitized Markdown with a small supported subset

Allow:

- Paragraphs
- Headings
- Lists
- Bold and italic
- Safe internal links

Reject:

- Scripts
- Embedded HTML
- Iframes
- Inline event handlers
- JavaScript URLs
- External tracking pixels

---

# 6. Image and GIF security

## Initially supported media

- JPEG
- PNG
- WebP
- GIF

Do not accept:

- SVG
- HTML
- PDF as announcement media
- Executable files
- Double extensions such as `launch.gif.js`
- Files whose content does not match their extension

## Required validation

Validate:

- File signature/magic bytes
- MIME type
- Extension
- Maximum file size
- Maximum image dimensions
- Valid decoded image
- Filename length
- Content hash

Recommended initial limits:

- Maximum file size: 8 MB
- Maximum dimensions: 4,000 × 4,000
- One cover media item per announcement

Store files under generated names outside the public source directory. Serve them through a controlled endpoint with:

```text
X-Content-Type-Options: nosniff
Cache-Control
Content-Security-Policy
Cross-Origin-Resource-Policy
```

Do not accept an arbitrary external image URL in Phase 1.

---

# 7. Audience targeting

The publisher must first choose the shop scope.

## Shop scope

- All active shops
- Selected shops
- Subscription plan
- Trial shops
- Active paid shops
- Future: geographic or release channel

For the Expenses launch, use:

```text
All active shops
```

## User audience

Allow selection by:

- Everyone
- Shop owners/Restaurant Admins
- Managers
- Employees
- Selected roles
- Selected permissions
- Selected users

Permission targeting is especially useful for feature launches.

Example:

```text
Users with expenses.view
OR users with expenses.create
```

## Recommended Expenses audience

Use two announcements if the messaging differs:

### Owner/Admin announcement

Target:

- Restaurant Admin
- Manager
- Users with `expenses.approve`
- Users with `expenses.manage_recurring`

Message focuses on:

- Approvals
- Recurring expenses
- Exports
- Audit history
- Cash-drop review

### Employee announcement

Target:

- Users with `expenses.create`

Message focuses on:

- Submitting expenses
- Uploading receipts
- Waiting for approval
- Tracking submission status

This is clearer than showing every user the same long message.

---

# 8. Audience evaluation rules

Eligibility must be calculated by the backend.

A user can see an announcement only when:

1. The announcement is published.
2. Its publication time has arrived.
3. It has not expired.
4. The user’s shop matches the shop scope.
5. The user matches at least one selected audience rule.
6. The user account and shop are active.
7. The announcement is compatible with that user’s application access.

Frontend visibility is not security. Direct API access must apply the same rules.

---

# 9. Delivery experience

Use three delivery surfaces.

## 9.1 First-view launch modal

When an eligible user signs in or opens the lobby:

- Show the newest unread important announcement.
- Display its image/GIF.
- Show title, summary and CTA.
- Provide **Not now**.
- Record that it was displayed.
- Do not repeatedly reopen it during the same session.

Only one modal should appear at a time.

Normal-priority announcements should generally not interrupt the user.

## 9.2 Announcement banner

Show an optional compact banner in the lobby or top-level application shell:

```text
New: Expenses is now available → Explore Expenses
```

The user may dismiss it.

## 9.3 Announcement center

Create:

```text
/app/announcements
```

Users can review:

- Unread announcements
- Recent announcements
- Previously read announcements
- Product launch information
- Attached media
- CTA destinations

The existing notification bell may show an announcement indicator, but the full content belongs in the Announcement Center.

---

# 10. Read and acknowledgement behavior

Track these separately:

- `first_displayed_at`
- `viewed_at`
- `acknowledged_at`
- `dismissed_at`
- `cta_clicked_at`
- `last_seen_version`

## Meaning

- **Displayed:** the application presented it.
- **Viewed:** the user opened the complete announcement.
- **Acknowledged:** the user explicitly confirmed it.
- **Dismissed:** the user closed the banner or modal.
- **CTA clicked:** the user followed the action.
- **Last seen version:** determines whether an important correction should appear again.

Do not equate “delivered” with “read.”

---

# 11. Display policies

Give the publisher these options:

## Standard

- Appears in Announcement Center
- May show a small unread badge
- Does not interrupt work

## Highlighted

- Appears once as a modal
- Remains in Announcement Center
- Can be dismissed

## Required acknowledgement

- Used only for important security or policy notices
- Requires an explicit **I understand**
- Must not permanently prevent login or emergency business operations

For the Expenses launch, use **Highlighted**, not required acknowledgement.

---

# 12. Database design

## `announcements`

Suggested fields:

```text
id
internal_name
headline
summary
body
type
priority
display_policy
status
cta_label
cta_path
publish_at
expires_at
published_at
published_by
created_by
updated_by
created_at
updated_at
version
```

## `announcement_media`

```text
id
announcement_id
storage_key
original_name
mime_type
file_size_bytes
width
height
content_sha256
uploaded_by
created_at
archived_at
```

## `announcement_audiences`

Store audience rules rather than duplicating one announcement for every user:

```text
id
announcement_id
audience_type
audience_value
created_at
```

Examples:

```text
shop:all
shop:42
role:Restaurant Admin
role:Manager
permission:expenses.view
permission:expenses.create
user:208
```

Use normalized columns instead of encoding these exact strings if preferred.

## `announcement_user_state`

```text
announcement_id
user_id
shop_id
first_displayed_at
viewed_at
acknowledged_at
dismissed_at
cta_clicked_at
last_seen_version
created_at
updated_at
```

Unique constraint:

```text
UNIQUE (announcement_id, user_id)
```

## `announcement_audit_events`

```text
id
announcement_id
actor_user_id
action
before_json
after_json
reason
created_at
```

Audit actions include:

- Created
- Edited
- Media uploaded
- Media replaced
- Scheduled
- Published
- Unpublished
- Cancelled
- Expired
- Archived

---

# 13. Recipient strategy

Do not create millions of notification rows when publishing globally.

Use:

- Audience rules stored once
- Eligibility evaluated when fetching announcements
- Per-user state created only after display/read/dismissal/action

Benefits:

- Fast publication
- Smaller database
- New eligible users can see currently active announcements
- No massive publish transaction

Add appropriate indexes for:

- Announcement status and publication dates
- Audience announcement/type/value
- User-state user ID and announcement ID
- User-state shop ID and unread queries

---

# 14. API design

## Super Admin management

```text
GET    /api/announcements/admin
POST   /api/announcements
GET    /api/announcements/:id
PATCH  /api/announcements/:id
POST   /api/announcements/:id/media
DELETE /api/announcements/:id/media
POST   /api/announcements/:id/schedule
POST   /api/announcements/:id/publish
POST   /api/announcements/:id/unpublish
POST   /api/announcements/:id/cancel
POST   /api/announcements/:id/expire
POST   /api/announcements/:id/archive
GET    /api/announcements/:id/audit
GET    /api/announcements/:id/analytics
```

## Recipient APIs

```text
GET  /api/announcements/inbox
GET  /api/announcements/unread-count
GET  /api/announcements/:id
POST /api/announcements/:id/displayed
POST /api/announcements/:id/viewed
POST /api/announcements/:id/dismiss
POST /api/announcements/:id/acknowledge
POST /api/announcements/:id/cta-click
```

Every recipient endpoint must recheck audience eligibility.

---

# 15. Super Admin interface

Create an announcement workspace with navigation:

```text
Announcements
Drafts
Scheduled
Published
Archived
```

## Table columns

| Announcement | Audience | Status | Publish date | Expiry | Reach | Actions |
|---|---|---|---|---|---|---|

Use the existing three-dot menu standard.

## Actions

- Preview
- Edit
- Duplicate
- Schedule
- Publish now
- Cancel schedule
- Unpublish
- Expire
- Archive
- View analytics
- View audit history

## Editor steps

### Step 1 — Content

- Headline
- Summary
- Body
- Announcement type
- Priority

### Step 2 — Media

- Upload image/GIF
- Preview desktop/mobile crop
- Replace/remove media
- Alternative text

### Step 3 — Audience

- Shop scope
- Roles
- Permissions
- Specific users
- Estimated recipient count

### Step 4 — Delivery

- Standard, highlighted or acknowledgement
- Publish now or schedule
- Expiration
- CTA label and route

### Step 5 — Preview and confirmation

Preview as:

- Restaurant Admin
- Manager
- Employee
- Desktop
- Mobile
- Light mode
- Dark mode

---

# 16. Publication transaction

Publishing must:

1. Lock the announcement.
2. Confirm it is draft or scheduled.
3. Validate content.
4. Validate media.
5. Validate audience rules.
6. Confirm at least one estimated recipient exists.
7. Validate CTA route.
8. Set publication timestamps and status.
9. Increment version.
10. Write an audit event.
11. Commit atomically.

Publishing should not synchronously create one database row per recipient.

---

# 17. Editing published announcements

Safe behavior:

- Cosmetic corrections may update the announcement and increment its version.
- Audience expansion should be audited.
- Audience reduction must immediately prevent removed recipients from fetching it.
- A major content change should offer:
  - Do not show again
  - Show updated announcement again

If “show again” is selected, users whose `last_seen_version` is older receive the updated announcement once.

---

# 18. Scheduling and expiration

A background job should:

- Publish scheduled announcements whose time has arrived.
- Expire announcements after `expires_at`.
- Record success and failure.
- Remain safe if executed multiple times.

Use UTC timestamps for storage and display dates in the viewer’s/shop’s configured timezone.

A scheduled job should improve timeliness, but recipient queries must also evaluate dates correctly so a delayed job never exposes expired content.

---

# 19. Analytics

## MVP analytics

Show:

- Estimated eligible users
- Unique displays
- Unique views
- Acknowledgements
- Dismissals
- CTA clicks
- View rate
- CTA click rate

## Later analytics

- Breakdown by shop
- Breakdown by role
- Breakdown by subscription plan
- Daily engagement
- Device type
- Announcement comparison

Do not collect unnecessary behavioral data.

---

# 20. Permissions

Add a dedicated platform permission family:

```text
platform_announcements.view
platform_announcements.create
platform_announcements.update
platform_announcements.publish
platform_announcements.archive
platform_announcements.analytics
```

For Phase 1, Super Admin receives these permissions.

Recipient access should not require a general `announcements.view` permission. Eligibility comes from the announcement’s audience rules.

---

# 21. Failure states

The implementation must handle:

- Media upload failure
- Unsupported media
- Malformed GIF/image
- Empty audience
- No eligible recipients
- Invalid CTA
- Invalid schedule
- Expiry before publication
- Publication conflict
- Already published
- Already expired
- Announcement not found
- User no longer eligible
- Database failure
- Media unavailable
- Offline/PWA mode
- Session expiration

Draft content must remain preserved if publication fails.

---

# 22. Testing requirements

## Authorization

- Restaurant users cannot access management APIs.
- Super Admin management permissions are enforced.
- A targeted user can read the announcement.
- A non-targeted user receives not found.
- A selected shop cannot expose announcements to another shop.

## Audience tests

Test:

- All shops
- Selected shops
- Admin only
- Employee only
- Selected role
- Selected permission
- Selected user
- Inactive user
- Blocked shop
- User whose role changes

## Lifecycle tests

Test:

- Draft
- Schedule
- Publish
- Cancel
- Expire
- Archive
- Published edit
- Version re-display
- Concurrent publish requests

## Media tests

Test:

- Valid JPEG/PNG/WebP/GIF
- Fake extensions
- Double extensions
- MIME mismatch
- Oversized file
- Excessive dimensions
- Corrupt image
- HTML or script content
- Media access by unauthorized users

## UI tests

Test:

- Desktop
- Mobile
- PWA
- Light/dark mode
- Modal display
- Dismissal
- Announcement Center
- CTA navigation
- Offline state
- Browser Back/refresh
- Screen-reader labels
- Keyboard focus and Escape behavior

---

# 23. Recommended implementation phases

## Announcement MVP — implement before Expenses launch

1. Announcement database tables
2. Super Admin-only management APIs
3. Safe image/GIF upload
4. All-shops and role/permission targeting
5. Draft, publish, expire and archive states
6. Super Admin editor and preview
7. Recipient inbox API
8. First-view highlighted modal
9. Announcement Center
10. Read, dismiss and CTA tracking
11. Expenses launch announcement
12. Permission, security and responsive verification

## Phase 2

- Scheduling
- Selected-shop targeting
- Detailed analytics
- Published-announcement version re-display
- Duplicate announcement
- Improved media cropping

## Phase 3

- Restaurant Admin shop announcements
- Push delivery
- Email delivery
- Subscription-plan targeting
- Experimentation/A-B variants
- Localization

---

# Expenses launch announcement example

## Audience 1: Owners and managers

**Headline:** Expenses is now available

**Summary:** Record operating costs, review employee submissions and manage recurring expenses from one organized workspace.

**CTA:** Open Expenses

```text
/app/expenses
```

## Audience 2: Employees with expense submission access

**Headline:** You can now submit expenses

**Summary:** Add an expense, attach its receipt and follow its approval status directly inside Orbit OS.

**CTA:** Submit an expense

```text
/app/expenses
```

## Recommended display

- Highlighted modal once
- Announcement Center entry
- Active for 30 days
- Not mandatory
- Image or lightweight GIF showing the Expenses table
- No push notification for the initial release unless the user has already enabled product-update pushes

## Announcement image storage (Cloudflare R2)

Set `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in the backend environment, both locally and on the hosting service, then restart the backend. Use the HTTPS S3 API endpoint without a bucket path and a bucket-scoped Object Read & Write token. Keep the bucket private; no public URL or browser CORS configuration is required because images are served through the authenticated backend.

When all four values are absent, uploads use `ANNOUNCEMENT_MEDIA_DIR` (default `data/announcement-media`). Partial R2 configuration rejects new uploads instead of silently storing files locally. With R2 configured, new objects use the `announcements/` prefix, and database storage keys start with `r2:`. Existing local files remain readable from their original directory; they are not automatically migrated. Keep their persistent disk or re-upload the images to move them to R2. Neon continues to store metadata only.

Uploads retain existing image validation, permissions, checksums, and audit records. Failed database writes remove the newly uploaded object. Replacing an image preserves archived image records and files.

Shared attachment infrastructure is tracked in [document_upload_pipeline.md](document_upload_pipeline.md); initial rollout and outstanding migrations are recorded in [files_pipeline_implementation.md](files_pipeline_implementation.md). Existing announcement artwork remains independent during rollout.
