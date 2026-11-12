# Premium Restaurant visual QA

final result: passed

Scope: supplied multi-screen restaurant reference board, limited to its V1 homepage/menu and administration customization. Reference cart/checkout/tracking are explicitly future scope in the user-provided brief. This is an original reusable visual implementation, not a pixel-identical branded clone.

Evidence opened and reviewed: user-attached source board in conversation; actual desktop/mobile restaurant example renders and published fixture screenshots in `reports/website-moon/`. Desktop public fixture is 1440px wide and mobile 390px; the source is a composite design board rather than a matching viewport, so exact pixel error metrics are inappropriate.

Required surfaces:
- Typography: bold italic food hero, clear two-line emphasis, compact readable navigation and cards. System Arial/Helvetica used; exact reference font was not supplied. Long restaurant names wrap without losing controls.
- Spacing/layout: announcement/header/hero/info strip/categories/three-column desktop menu/promotion/footer follow the supplied hierarchy. Two-column mobile cards, scrollable categories and expandable nav have no horizontal viewport overflow. Deliberate additional story section appears only when configured.
- Tokens: owner-configurable red primary/yellow accent with white surface and dark footer. Visible focus indicators and availability states. No unconfigured promotional bar or percentage badge.
- Imagery: original photorealistic pizza/burger/combo/fries/pasta assets, optimized and served locally. Existing Lucide icons reused. No copied brand marks, text glyph replacements, or hotlinked source assets.
- Content: editable owner-approved text, configured prices and real arithmetic discount percentages. Fixture content explicitly marked as examples. V1 uses View details instead of Add to Cart; no false working checkout.

Findings fixed and recaptured:
1. Duplicate Deals category removed when a configured Deals group and deal shortcut coincide.
2. Hero text legibility improved with configurable overlay and restrained text shadow.
3. Below-fold image verification now loads/decode-checks images before captures; hidden dialog lazy loading was a test wait issue, not a broken menu asset.
4. Product-photo selector receives an explicit accessible name; template asset proxy works in development.

Interaction evidence: premium browser test passed search/categories/no-results reset, private/live preview, editor/save/publish, anonymous public page, native dialog open/Escape/focus return, mobile navigation, image loading and no browser errors. Existing Website Moon browser regression also passed.

Remaining nonblocking differences: original food photos and library logo fallback; no branding from reference brands; fixture prices/content differ across reviewed states; no future ordering controls. Full assistive-technology audit and deployed HTTPS/R2 checks are not claimed by this visual review.

# Active Orders reference implementation - 2026-11-11

final result: passed

The supplied Active Orders dashboard and component-state board were compared with the implemented React table at 1848 x 851, plus 390/320 mobile cards and dark mode. Earlier typography, casing, sizing, and text-encoding findings were fixed and recaptured. Full evidence, intentional differences, state coverage, and remaining limits are recorded in [reports/active-orders-design-qa.md](reports/active-orders-design-qa.md). Design interaction tests, existing order workflow/permission tests, delivery completion regressions, filter/routing unit tests, and the production build passed. No deployment or migration was performed.
