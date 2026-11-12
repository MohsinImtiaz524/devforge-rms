# Active Orders visual QA - 2026-11-11

final result: passed

## Scope and visual targets

Existing React POS View Orders screen, implemented against the user-supplied Active Orders Dashboard UI.png and Orbit OS Active Orders Design System.png. This updates the production component, not a separate prototype. Existing APIs, permission checks, printing, payment routing, and dialogs remain in use.

The reference dashboard is 1848 x 851 pixels. The implementation was captured at 1848 x 851 CSS pixels, device scale factor 1. Source and implementation were opened together for visual comparison. The design-system board supplies the state hierarchy where it differs from the dashboard: completed badges are green, cancelled badges red, and secondary actions have white idle surfaces.

## Evidence

- Desktop table: tmp/orders-design-desktop.png
- Mobile cards: tmp/orders-design-mobile-390.png and tmp/orders-design-mobile-320.png
- Dark mobile: tmp/orders-design-dark.png
- Loading skeleton: tmp/orders-design-loading.png
- Automated design interactions: frontend/tests/pos-orders-design.cjs
- Full existing workflows: frontend/tests/pos-orders-parity.cjs
- Delivery completion regression: frontend/tests/pos-delivery-completion.cjs

## Comparison and iteration

Initial capture exposed P2 differences: desktop controls/text were too small relative to the supplied reference, column headers inherited uppercase styling, the subtitle inherited excessive weight, and pagination separators had text-encoding artifacts. Desktop typography/control sizing, title alignment, subtitle weight, header casing, and separator encoding were corrected and recaptured.

Final comparison confirmed the same header/filter/table/pagination hierarchy, purple primary actions, white icon secondary actions, distinct selected rows, readable state/type badges, and usable mobile cards. Header and actions were reviewed at readable full desktop size. Mobile screenshots were reviewed separately for wrapping, action visibility, and viewport overflow. Dark-mode evidence was captured after theme transitions completed to avoid judging intermediate colors as final states.

No outstanding P0/P1/P2 visual or interaction findings in the reviewed scope.

## Verified states and interactions

- Primary and secondary idle appearances differ; secondary hover differs from idle.
- Pressed, keyboard focus, selected view/page, row selection, disabled pagination, and refresh loading states are implemented.
- Search matches order number, table, customer, phone, address, and waiter across loaded records before pagination.
- Type, lifecycle status, and table filters reset pagination and operate together.
- Five records per page; previous/next and numbered pages work without silently truncating at fifty orders.
- Ctrl/Cmd+K focuses search; clearing search restores focus.
- Loading skeleton, filtered empty state/reset, no-orders state, retained-data error banner, and Retry are exercised.
- Completed/cancelled records retain View/Print and do not expose Edit or payment/completion.
- Responsive checks at 390 and 320 pixels passed without horizontal page overflow.
- Existing full workflow test passed details, edit preview, delivery assignment, print inquiry, linked tax presets, tips/date filters, payment, and viewer/waiter permissions.
- Delivery payment/direct completion after a prior Walk-in selection passed for retail and mixed shops.
- Unit/regression tests for filtering and completion routing passed. Production build passed.

## Intentional differences and remaining limits

Reference order content is test fixture data. Real orders and live connection state are displayed honestly; the fixture reconnecting badge is not relabelled Live. The default Active filter excludes terminal orders; All Statuses was selected for the desktop comparison to show the reference's five status examples. Disabled Previous on page one follows the component-state board rather than the dashboard's enabled-looking illustration. Native accessible select menus and the existing Lucide library are retained. Exact font files were not supplied, so the system sans-serif stack is used; minor icon/font and column-width differences are P3 polish.

Follow-up user requirement: View Orders is a completion queue. The Completed filter was removed and completed orders are now excluded unconditionally, including All Statuses and search. Delivery payment/direct-completion browser regressions verify that a completed order disappears after refresh. Updated desktop evidence therefore omits the completed reference example intentionally.

Filters operate on records returned by the existing sales API; no new historical data API was added. Real printer hardware, live production data, and full assistive-technology certification are outside this visual check. No deployment, database migration, or production configuration changes were performed.
