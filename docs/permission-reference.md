# Permission reference

Source review: 29 October 2026, updated for the Inventory Archive implementation. No live PostgreSQL roles were inspected. This describes current code, not guaranteed access from a permission alone. Staff management belongs to Moons by product direction; its current RMS endpoints are included so existing links are visible.

## How to read permissions

`products.create` means “create products.” A permission does not automatically include `view` or other actions. Below, each action joins to its row's prefix: `products` + `view` = `products.view`.

There are several checks: lobby visibility (`allowed_panels` plus permissions), page/button checks, global API checks, route checks, and business rules. Passing one does not guarantee passing the next. Within one `requirePermission(A, B)` call, **either** permission works; separate middleware checks must **both** pass. Tenant, ownership, account status, and workflow rules still apply.

## What each permission is for

All catalog actions are listed below. “Linked API” identifies the endpoint family; special cases follow the table. API paths start with `/api/`.

| Prefix | Actions and meaning | Linked API / screen |
| --- | --- | --- |
| `dashboard` | `view`: dashboard summaries | `analytics/dashboard-data`; Dashboard |
| `orders` | `view`: read orders; `create`: place orders; `update`: edit; `remove_items`: reduce/remove existing items; `complete`: complete orders; `take_payment`: payments and tips; `return`: returns | `sales`, `tips`, selected `kds` status changes; POS |
| `sales` | `view`: sales history; `take_payment`: history payment operations; `return`: history returns | `sales` requests carrying `view=sales_panel`; Sales |
| `delivery` | `view`: delivery list; `update_status`: delivery progress; `take_payment`: delivery payment | `delivery`; Delivery |
| `kitchen_orders` | `view`: kitchen queue; `update_status`: progress updates; `complete`: ready/completed updates | `kds`; Kitchen Display |
| `products` | `view`: products/categories; `create`: add; `update`: edit; `delete`: remove; `adjust_stock`: stock/harvest operations; `manage_damage`: damage operations | `products`, `product-categories`; Menu and Inventory |
| `raw_stock` | `view`: ingredients and waste history; `create`: add ingredient; `adjust`: stock changes AND ingredient details; `record_waste`: ingredient waste | `raw-stock`; Inventory |
| `inventory_archive` | `view`: archive history and audit details; `archive`: archive items/quantities and search eligible items; `restore`: restore once with a reason | `inventory-archives`; Inventory → Archive; no Kitchen/Users/Settings prerequisite |
| `recipes` | `view`: recipes/product links; `create`: add recipe; `update`: edit; `delete`: delete; `link_product`: add/remove product links | `recipes`; recipe workflows |
| `brands` | `view`: brands, dues/shares/payment reads; `create`: add; `update`: edit; `delete`: remove; `manage_payments`: payment/share changes | `brands`; Brands and product-form lookups |
| `customers` | `view`: customers; `create`: add; `update`: edit; `delete`: remove; `manage_ledger`: payment/adjustment operations | `customers`; Customer Ledger and POS lookups |
| `expenses` | `view`: read; `create`: create and limited read/edit/receipt operations; `update`: edit/upload receipt; `delete`: archive/restore/remove receipt; `approve`: approve/reject; `export`: reports/export; `manage_categories`: catalog entry, actual category writes require superadmin; `manage_recurring`: read/change recurring expenses | `expenses`, legacy `expense-categories`; Expenses |
| `tables` | `view`: read; `manage`: general changes; `create`: create; `update`: edit; `delete`: remove (granular actions are currently limited by global `manage` check) | `tables`; Tables |
| `analytics` | `view`: analytics and AI API family | `analytics`, `ai`; Analytics; dashboard-data uses `dashboard.view` instead |
| `reports` | `view`: operational reports | `reports`; Reports |
| `register` | `view`: active/details/summary; `open`: open drawer; `close`: close; `cash_drop`: submit drop; `verify_cash`: review drops/handovers; `handover`: handover; `view_history`: shift history | `shifts`, `expenses/cash-drops`; Register and Expenses |
| `settings` | `view`: settings, printers, notification preferences; `update`: general settings/preferences; `manage_discounts`: discount changes; `manage_taxes`: tax changes; `manage_printers`: printer changes | `shop-settings`, `printers`, `notification-preferences`; Settings |
| `users` | `view`: accounts and account options; `create`: create login; `update`: edit/reset login and selected salary operations; `delete`: delete login; `assign_roles`: role assignment | `users`, `staff/:id/access`, account options, selected payroll salary endpoints |
| `staff` | `view`: profiles/organization; `create`: add profile; `update`: edit; `manage_organization`: department/title catalogs and assignments | `staff`; current `/app/staff` workspace |
| `attendance` | `view`: attendance/calendar; `clock`: catalog entry without a personal clock route in current attendance router; `manage_schedules`: templates/schedules/holidays; `correct`: request correction; `approve`: correction review and attendance snapshots; `mark_daily`: shift marking and clock-out | `attendance`; Staff attendance |
| `leave` | `view`: policies/balances/requests; `request`: request/cancel leave; `manage`: types/balance allocations; `approve`: decision | `leave`; Staff leave |
| `payroll` | `view`: salary/run/payslip reads; `configure`: salaries/recurring items/advances/adjustments; `run`: periods/calculations; `review`: review run; `approve`: approve run; `finalize`: finalize/reverse/release salary | `payroll`; Staff payroll |
| `documents` | `view`: categories/list/preview; `upload`: upload; `manage`: categories/archive; `download`: download | `documents`; Staff documents |
| `staff_activity` | `view`: filters/reports/records; `manage`: add/update records; `export`: export | `staff-activity`; Staff activity |
| `roles` | `view`: roles/catalog; `create`: add role; `update`: details; `delete`: delete role; `assign_permissions`: edit grants | `roles`; Role editor |
| `notifications` | `view`: general notifications; `mark_read`: mark read; `manage`: other notification changes | `notifications`; Notifications; private Inbox has exceptions |
| `activity_logs` | `view`: activity logs | `activity-logs`; Logs |
| `waste` | `view`: waste records; `create`: record waste | `waste`; Waste Management |
| `platform_shops` | `view`: platform/shop reads; `create`: add; `update`: edit and staff transfer; `delete`: delete | `shops`, most `admin` endpoints, staff transfer; Platform administration |
| `platform_subscriptions` | `view`: subscription reads; `manage`: subscription changes | `subscriptions`; Platform Payments |
| `platform_finance` | `view`: financial logs; `manage`: financial log changes | `admin/financial-logs`; platform finance |
| `platform_announcements` | `view`: intended admin reads; `create`: create; `update`: edit; `publish`: publish; `archive`: archive; `analytics`: metrics. Current admin routes enforce superadmin role rather than these individual grants | `announcements`; platform announcements |

## Where permissions link to other work

| Work | Actual linkage / consequence |
| --- | --- |
| Inventory default “All” view | Updated with archive work: only loads ingredient/product datasets allowed by the session permissions. Archive-only users open the Archive view without requiring those reads. |
| Inventory lobby tile | Requires `allowed_panels` containing `raw-stock`, plus any `raw_stock.*`, `recipes.*`, or `inventory_archive.*` grant. Product-only access can still pass the page check but fail this lobby check; recipe-only access can show the tile but fail the page check. |
| Stock product form | Loads brands and categories together: usually `brands.view` plus `products.view` (category reads also accept `orders.create`). Creation permission alone does not supply these lookups. |
| Category kitchen/printer choices | Kitchen choices read `/users` (`users.view`); printers read `/printers` (`settings.view`). Errors are converted to empty lists. This is NOT a confirmed requirement for `kitchen_orders.*` to open Inventory. |
| Assign a user role through `PUT /users/:id` | Global check requires `users.update`; route accepts `users.update` OR `users.assign_roles`; service requires `users.assign_roles` when changing roles. Role assignment effectively needs both. |
| Edit role grants through `PUT /roles/:id` | Global check requires `roles.update`; route accepts update OR assign; changing grants requires `roles.assign_permissions`. Effectively both are required. |
| Table create/edit/delete | Global policy requires `tables.manage` for non-GET requests, even where route checks accept granular create/update/delete. Granular permissions alone are insufficient. |
| POS supporting reads | `orders.create` also permits global reads of products, categories, tables, customers, assignable users, and discount/tax lookups. `orders.view` also permits product reads. Further endpoint/service checks can still apply. |
| Shared kitchen status API | Ready/completed PATCH accepts `kitchen_orders.complete` OR `orders.complete`; other ordinary status changes use `kitchen_orders.update_status`. Served PATCH bypasses that global permission check and relies on service rules. POS also calls this API. |
| Salary configuration | Selected `/payroll/staff/:id/salary` reads accept `users.view` OR `users.update` OR `payroll.view`; writes accept `users.update` OR `payroll.configure`. Account permission can therefore grant salary access. |
| Payroll releases | Current-month release and entry payments require `payroll.finalize` in the route, but fall through to `payroll.view` globally. These actions effectively require both. |
| Attendance snapshots | Router requires `attendance.approve`; global policy falls through to `attendance.view`. Snapshot operations effectively need both. |
| Leave cancellation | Global request-path rule requires `leave.request` for PATCH; route also requires `leave.request`. No extra `leave.approve` is required for cancellation. |
| Organization options/hierarchy | Router asks for `staff.view`; global organization-catalog rule is limited to `/organization/catalog`. Options/hierarchy use the default `staff.view`. |
| Expenses | Global policy explicitly delegates to the Expenses router. `expenses.create` also allows list/detail/audit reads and some edits/receipt uploads, subject to business rules. Category changes remain superadmin-only. |
| Legacy expense-category API | Global generic mapping still applies to `/expense-categories`; POST maps to `expenses.create`, PATCH to `expenses.update`, DELETE to `expenses.delete`, followed by route superadmin checks. This differs from the modular category routes. |
| Private Inbox | Explicit `channel=inbox` read/mark-read operations bypass optional notification-panel grants; normal authentication/relevance rules still apply. |
| Printer kitchen assignment | Requires `settings.manage_printers` globally AND legacy admin/superadmin role at the route; permission alone is insufficient. |

## Sources and limits

- [Catalog: all permission names](../authorization/catalog.js)
- [Global API mapping and exceptions](../authorization/api-policy.js)
- [Permission middleware: OR within one check](../authorization/middleware.js)
- [Role-derived effective permissions](../authorization/service.js) — current resolver reads assigned roles; legacy per-user permission records are not merged into effective permissions.
- [Lobby visibility](../services/LobbyService.js) and [legacy navigation](../public/js/app.js)
- [Inventory page](../frontend/src/modules/inventory/InventoryPage.jsx), [data loading](../frontend/src/modules/inventory/hooks/useInventory.js), [product form](../frontend/src/modules/inventory/components/StockProductFormModal.jsx), [category routing](../frontend/src/modules/inventory/components/ProductCategoriesView.jsx)
- Route checks: [Users](../routes/users.js), [Roles](../routes/roles.js), [Tables](../routes/tables.js), [Printers](../routes/printers.js), and module routers under [src/modules](../src/modules).

This is a compact source map, not a full endpoint-by-endpoint security audit. No browser reproduction or live role inspection was performed. Permission names describe intent; the linkage table records observed differences in enforcement. Giving broader permissions can hide these differences without resolving them.
