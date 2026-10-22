# Expenses Panel Completion Plan

## Fixed product rules

These rules remain unchanged throughout implementation:

- No paid/unpaid expense workflow.
- No brand-share functionality.
- Expenses represent recorded business costs.
- Every expense remains isolated by `shop_id`.
- Employees require `expenses.create` to submit an expense.
- Non-admin submissions enter `pending_review`.
- Authorized reviewers approve or reject submissions.
- Only Super Admin manages global expense categories.
- Archived categories remain attached to historical expenses but cannot be selected for new expenses.
- Cash drops remain cash-drop requests until verified.
- Verifying a cash drop creates one approved expense.
- Tables, server pagination and three-dot action menus remain the standard UI.
- Financial and audit history must never be hard-deleted.

---

# Phase 1 — Cash-Drop Workflow Completion

## 1.1 Correct notification destination

Change cash-drop notification actions from:

```text
/dashboard#register
```

to:

```text
/app/expenses/cash-drops
```

Notifications remain useful for alerting reviewers, but all reviewing happens inside Expenses.

## 1.2 Rejection reason

When the reviewer chooses **Reject**:

1. Open a modal.
2. Require a meaningful reason.
3. Validate the reason on frontend and backend.
4. Store:
   - rejection reason
   - reviewer ID
   - reviewed timestamp
   - previous and new status
5. Display it in the cash-drop table/details.

## 1.3 Verification transaction

Verification must atomically:

1. Lock the cash-drop record.
2. Confirm it is still pending.
3. Change it to verified.
4. Create the approved expense.
5. Connect the expense and cash drop.
6. Write audit events.
7. Commit everything together.

If expense creation fails, verification must also fail and roll back.

## 1.4 Traceability

Add navigation both ways:

- Cash drop → generated expense
- Expense → original cash drop and register shift

Store a direct `generated_expense_id` or equivalent protected relationship instead of depending only on text references.

## 1.5 Idempotency

Repeated verification requests must never create duplicate expenses.

Use:

```text
occurrence_key = cash-drop:<cash_drop_id>
```

and a database uniqueness guarantee.

## Acceptance criteria

- Only users with `register.verify_cash` can decide cash drops.
- Rejection requires a reason.
- A rejected cash drop creates no expense.
- A verified cash drop creates exactly one approved expense.
- Concurrent verification requests cannot duplicate expenses.
- Notifications open the Expenses cash-drop queue.
- Wrong-shop IDs return not found and reveal no data.

---

# Phase 2 — Filter-Aware Exports

## 2.1 Export the visible dataset

CSV and PDF export must accept the same filters as the table:

- Month
- From/to dates
- Search
- Category
- Status
- Vendor
- Submitter
- Reviewer
- Source
- Receipt state
- Sort column
- Sort direction

## 2.2 Export scopes

Provide two clear options:

- **Export current results**
- **Export selected month**

Initially, exporting current results is sufficient if we want to avoid extra controls.

## 2.3 Backend safety

The backend must:

- Parse filters through the existing Zod list schema.
- Ignore client-supplied `shop_id`.
- Enforce `expenses.export`.
- Export only records accessible to that user.
- Apply a safe maximum export size or stream large exports.
- Protect spreadsheet cells beginning with `=`, `+`, `-`, or `@` from CSV formula injection.

## 2.4 PDF layout

The PDF should include:

- Shop identity
- Applied reporting period
- Applied filters
- Generated timestamp
- Approved total
- Record count
- Category summary
- Paginated expense table
- Page numbers
- Currency
- Empty-result presentation

## Acceptance criteria

- Export results match the filtered table.
- Custom date-range export works without a month.
- All-dates mode does not produce an invalid request.
- Archived or pending records appear only when explicitly selected.
- CSV and PDF totals reconcile with backend results.
- Unauthorized users cannot export through direct URLs.

---

# Phase 3 — Reliable Recurring Expense Processing

## 3.1 Dedicated background execution

Recurring generation must no longer depend exclusively on opening the Expenses page.

Introduce a bounded recurring processor that runs independently through the existing application deployment architecture.

Possible execution model:

- A protected scheduled endpoint called by Render Cron, or
- A dedicated application worker process.

For the current architecture, a protected scheduled endpoint plus Render Cron is likely the simplest operational choice.

## 3.2 Processing rules

For every due template:

1. Determine the shop’s business date using its configured timezone.
2. Lock the recurring template.
3. Confirm it is active.
4. Generate every due occurrence within a defined catch-up limit.
5. Use a unique occurrence key.
6. Advance `next_run_date`.
7. Archive the template when its end date is completed.
8. Write audit events.
9. Commit atomically.

## 3.3 Failure handling

Record operational information for:

- Last attempted run
- Last successful run
- Last error
- Consecutive failure count

One broken template must not stop processing other shops or templates.

## 3.4 Retry and concurrency

- Multiple workers must be safe.
- Generated occurrences must be idempotent.
- Retries must not duplicate expenses.
- A maximum catch-up limit must prevent unbounded processing.

## Acceptance criteria

- Expenses are generated without opening the panel.
- Monthly dates handle short months and leap years.
- Shop timezone determines the business date.
- Paused and archived templates generate nothing.
- Duplicate scheduler calls remain safe.
- Failed templates are visible for administrators to diagnose.

---

# Phase 4 — Recurring Table Filtering

Add server-backed controls for:

- Search by title, vendor or reference
- Status: Active, Paused, Archived, All
- Category
- Frequency
- Next-run date range
- Sort by title, amount, next run, status or created date
- Sort direction
- Clear filters

Persist filter state in the URL.

## Acceptance criteria

- Filtering never hides the entire table during refresh.
- Existing rows remain visible with a lightweight loading indicator.
- Changing a filter resets pagination to page one.
- Browser Back and refresh restore filters.
- All queries remain shop-isolated and paginated.

---

# Phase 5 — Cash-Drop Table Filtering

Add:

- Status
- Date range
- Requester
- Amount range
- Shift/reference search
- Reason search
- Sortable columns
- Clear filters
- URL persistence

Keep the table optimized with server pagination and request cancellation.

## Acceptance criteria

- Filtering operates on the backend.
- Pagination totals represent the filtered dataset.
- Rapid filter changes cancel stale requests.
- The table does not disappear during refresh.
- Mobile uses horizontal table scrolling without changing data behavior.

---

# Phase 6 — Category Audit History

## 6.1 Audit events

Record Super Admin actions:

- Category created
- Renamed
- Archived
- Restored

Each event stores:

- Category ID
- Actor ID
- Action
- Before state
- After state
- Reason if required
- Timestamp

## 6.2 Super Admin interface

Add **View history** to the category three-dot menu.

The history panel should display:

- Action
- Previous and new name
- Actor
- Date and time
- Archive/restore status

## Acceptance criteria

- Only Super Admin can manage or inspect category administration.
- Historical audit events are immutable.
- Category history is not tied to any shop.
- Archived categories remain visible in historical expenses.

---

# Phase 7 — Consistent Action Confirmations

Use confirmation dialogs for actions that change lifecycle state:

- Archive expense
- Restore expense
- Approve expense
- Reject expense
- Archive category
- Restore category
- Pause recurring template
- Resume recurring template
- Archive recurring template
- Restore recurring template
- Remove or replace receipt
- Verify or reject cash drop

Each dialog should:

- Identify the affected record.
- Explain the result.
- Require a reason where appropriate.
- Disable submission while processing.
- Preserve entered text if the request fails.
- Display backend validation errors inside the dialog.
- Prevent double submission.

Reason should be required for:

- Expense rejection
- Expense archive
- Cash-drop rejection

Other actions may use an optional reason later.

---

# Phase 8 — Legacy Expenses Retirement

Do this only after functional parity is proven.

## 8.1 Trace old callers

Inspect all references to:

- `routes/expenses.js`
- `services/ExpenseService.js`
- Legacy expense JavaScript
- Legacy dashboard links
- Old category endpoints

## 8.2 Migration process

1. Confirm the new module owns every active workflow.
2. Redirect remaining frontend callers.
3. Add compatibility redirects only where necessary.
4. Remove duplicate route mounting.
5. Remove obsolete service code.
6. Keep database history untouched.
7. Run full regression testing.

No legacy code should be removed merely because it appears unused; callers must be proven absent.

---

# Phase 9 — Permission and Tenant-Isolation Audit

Test each operation independently:

| Operation | Required authority |
|---|---|
| View all shop expenses | `expenses.view` |
| View own submissions | Defined restricted behavior |
| Create expense | `expenses.create` |
| Edit general expense | `expenses.update` |
| Edit own pending expense | `expenses.create`, owner only |
| Approve/reject | `expenses.approve` |
| Archive/restore | `expenses.delete` |
| Export | `expenses.export` |
| Manage recurring | `expenses.manage_recurring` |
| Verify/reject cash drops | `register.verify_cash` |
| Manage global categories | Super Admin only |

Every backend route must enforce its own permission. Hiding a button is not sufficient security.

Tests must confirm:

- One permission never accidentally depends on another.
- Users cannot access another shop’s records.
- Direct API requests cannot bypass the interface.
- Owners can modify only the states explicitly allowed.
- Super Admin category authority does not grant access to restaurant expense records unintentionally.

---

# Phase 10 — Final UX and Operational Verification

## Required UI states

Every navigation needs:

- Initial loading
- Background refreshing
- Empty results
- Validation error
- Server error
- Database error
- Unauthorized
- Not found
- Version conflict
- Success confirmation
- Partial success, such as expense saved but receipt upload failed

## Required viewports

Verify:

- Desktop
- Tablet
- Narrow mobile
- Installed PWA
- Light mode
- Dark mode

## Required navigation checks

- Direct URL
- Lobby navigation
- Sidebar navigation
- Browser Back/Forward
- Refresh
- Session expiry
- Logout
- Collapsed sidebar persistence

## Required automated verification

After every phase:

1. Backend syntax checks.
2. Focused workflow tests.
3. Permission tests.
4. Tenant-isolation tests.
5. Concurrency/idempotency tests when relevant.
6. Receipt-security tests.
7. React lint.
8. Production frontend build.
9. `git diff --check`.
10. Final changed-file inspection.

Before final release:

- Run the complete root test suite.
- Run production build.
- Test against PostgreSQL, not only SQLite.
- Test deep links under `/app/expenses/*`.
- Confirm legacy `/`, `/dashboard`, and `/api/*` ownership remains correct.
- Confirm no request-time database migration or unbounded query was introduced.

---

# Recommended implementation order

1. Cash-drop workflow and routing
2. Filter-aware CSV/PDF export
3. Background recurring processor
4. Recurring filters
5. Cash-drop filters
6. Category audit history
7. Consistent confirmations
8. Permission matrix and tenant audit
9. Legacy cleanup
10. Final release verification

Each phase should be implemented, tested and reviewed independently before moving to the next. This keeps financial workflows safe and makes regressions easier to identify.