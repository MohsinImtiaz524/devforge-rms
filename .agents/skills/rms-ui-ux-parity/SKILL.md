---
name: rms-ui-ux-parity
description: Build or migrate ORBIT OS React interfaces while preserving the established vanilla UI, navigation, PWA behavior, responsive layout, and interaction logic. Use for RMS frontend pages, lobby modules, theme behavior, loaders, or vanilla-to-React migration.
---

# RMS UI/UX Parity

Treat the current vanilla interface as the product specification unless the user explicitly requests a redesign.

## Inspect before editing

For a migrated page, trace:

- its HTML shell and Tailwind classes in `public/*.html`;
- renderer, globals, handlers, history state, storage, and API calls in `public/js/`;
- permission and panel visibility rules;
- light, dark, mobile, installed-PWA, loading, empty, error, and unauthorized states;
- every caller of shared legacy functions before removing or changing them.

## Parity rules

- Match the existing layout, spacing, colors, typography, icons, breakpoints, controls, hover/focus states, and copy. Do not substitute a new design system during migration.
- Preserve interaction behavior: profile dropdown, browser Back, module switching, logout safeguards, notifications, install flow, and session expiry.
- Preserve accessibility semantics, keyboard dismissal, focus visibility, labels, and disabled states.
- Rebuild behavior as React components; do not paste HTML strings or rely on global `onclick` handlers inside React.
- Keep the legacy page as a fallback until parity is validated.

## Shared theme invariant

The selected theme must apply to React, legacy modules, login, platform monitoring, mobile, and PWA views.

- Use the `dark` class as the styling authority.
- Persist `theme` in `localStorage`.
- Synchronize `rms_theme` as a same-host cookie because development ports have separate local-storage origins.
- Apply the saved theme before rendering to avoid a light/dark flash.
- Do not use `prefers-color-scheme` to override an explicit saved choice.

## Loading and routing

- Lazy-load substantial React routes.
- Show a stable skeleton shaped like the destination page until required API data resolves.
- Avoid layout jumps, blank screens, and spinner-only waits for data-heavy pages.
- Development uses Vite; production serves React from `/app/*` through Express.
- Legacy targets remain `/dashboard#<module>` and React targets remain `/app/<module>`.

## Completion check

Compare old and new behavior for every relevant role and viewport. Report intentional differences and unresolved parity gaps explicitly; never claim exact parity based only on a successful build.
# Orbit OS — Codex Engineering & Reliability Rules

## Project Context

Orbit OS is an existing, production restaurant management SaaS application built using Node.js, Express, PostgreSQL, WebSockets and Cloudflare R2.

It is multi-tenant and supports live restaurant ordering, printing, employee management, billing and modular functionality called Moons.

Production stability, customer data integrity and backward compatibility are mandatory.

## Rule 1 — Understand Before Editing

Before implementing any task:

1. Inspect the relevant existing code, dependencies, database tables and middleware.
2. Trace the complete request flow, including frontend, API, service and database.
3. Identify existing behavior that must remain unchanged.
4. Identify affected tenants, permissions and integrations.
5. List likely failure scenarios.
6. Select the minimum safe implementation.

Never invent assumptions about existing files, functions or database structures.

## Rule 2 — Error Prevention

Every new operation must consider:

- Invalid input.
- Missing records.
- Duplicate requests.
- Simultaneous requests.
- Network interruption.
- Database failure.
- Authorization failure.
- Expired sessions.
- Partial completion.
- Service restarts.
- External service failures.
- Unexpected null or undefined values.

Never silently ignore exceptions.

Use centralized error handling and structured logs.

Do not expose database details, secrets or stack traces to ordinary users.

## Rule 3 — Database Safety

Use transactions for operations requiring multiple related database changes.

Use foreign keys and uniqueness constraints when appropriate.

Use parameterized SQL.

Use idempotency keys or database constraints where repeated requests could cause duplicated financial or operational effects.

Avoid destructive migrations without an approved migration and recovery strategy.

Never automatically reset or delete production data.

Preserve tenant isolation across all reads and writes.

## Rule 4 — Authorization and Security

For each protected operation, verify:

1. Authentication.
2. Active shop membership.
3. Correct tenant ownership.
4. Active platform and Moon entitlement where required.
5. Required user permission.
6. Resource-level authorization.

Default to denying access when authorization cannot be established.

Never trust frontend permission checks alone.

Never take trusted shop ownership directly from arbitrary request data.

## Rule 5 — Moons Architecture

Moons are hardcoded modules with a shared registry.

Reuse existing services and routes wherever possible.

Keep Moon registration separate from subscriptions, permissions and billing.

Do not duplicate existing business functionality.

Cancelled or expired Moons must preserve appropriate historical business records.

Unpaid invoices must not automatically block access to the platform or subscribed Moons.

## Rule 6 — Billing Reliability

Prevent duplicate invoices and duplicate payment allocation.

Use accurate monetary types and explicit rounding rules.

Preserve historical invoice prices.

Make recurring billing jobs safe to retry.

Ensure billing failures do not stop restaurant operations.

Do not automatically suspend shops for overdue invoices.

## Rule 7 — WebSocket and Printing Reliability

Protect the live order and print workflow from unrelated feature changes.

Consider reconnects, duplicate events, delayed events and temporary disconnections.

Do not assume WebSocket delivery guarantees that a client processed an event.

Use persisted order and print-job states where appropriate.

Do not automatically retry printing without considering duplicate physical receipts.

Do not modify existing ordering or printing architecture unless required by the approved task.

## Rule 8 — External Services

Cloudflare R2 and other integrations can fail independently.

Use bounded timeouts and appropriate retries with backoff for transient failures.

Avoid retrying non-idempotent operations without safeguards.

Prevent orphaned asset references and unsafe file uploads.

## Rule 9 — Mandatory Testing

For every meaningful change:

1. Add happy-path tests.
2. Add invalid-input tests.
3. Add authorization tests.
4. Add cross-tenant isolation tests when applicable.
5. Add duplicate-request tests.
6. Add concurrency tests where relevant.
7. Add failure and recovery tests.
8. Run related existing regression tests.

Never claim tests pass unless they were actually executed.

## Rule 10 — Production Protection

Never edit production environment variables or run production migrations without explicit approval.

Do not deploy automatically.

Do not introduce breaking API or database changes without a compatibility strategy.

Prefer additive migrations and incremental feature flags.

Provide a rollback or recovery procedure for risky changes.

## Rule 11 — Completion Report

After implementing a task, report:

- Files changed.
- Existing behavior preserved.
- Failure scenarios considered.
- Tests added.
- Tests executed and results.
- Remaining risks.
- Manual verification needed.
- Deployment or migration requirements.

Clearly distinguish verified results from assumptions.

Do not mark a task complete if critical tests are failing or have not been run; report that limitation explicitly.

## Rule 12 — Scope Discipline

Do not refactor unrelated working modules.

Do not install unnecessary dependencies.

Do not rewrite existing functionality merely to follow a design pattern.

Prefer small, maintainable changes compatible with the current system.

If a dangerous operation is required, explain the risk and request approval before proceeding.