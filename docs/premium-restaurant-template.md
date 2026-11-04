# Premium Restaurant template

Implemented inside the existing Website Moon gallery as `premium-restaurant` / **Premium Restaurant**. The existing three templates remain available. This is the original restaurant design supplied in the user's latest prompt/reference board, not a claim of an exact Chunk n Cheese clone.

## Included

- Responsive red/white restaurant layout, optional announcement, sticky navigation, original food hero, horizontal category controls, photo menu cards, calculated discount badges, optional deal/about sections and contact/footer.
- Working menu search, category filtering, no-results reset, accessible native product detail dialogs, Escape handling and mobile navigation.
- Existing React editor, Moon sidebar, API client, Zod, Express/Knex/session authorization, verified uploads, R2 adapter and Lucide icons reused. No new UI framework or per-shop deployment.
- Editable restaurant CTA labels/approved links, hero alignment/overlay, announcement text/colors/link, story/opening hours/map, footer/policies, menu photos/labels/availability/deal metadata.
- Original ImageGen images stored locally in `public/website-templates/premium-restaurant/` and optimized to WebP; no hotlinked brand assets. Approved shared product photos are explicit IDs; uploaded product photos use the same tenant ownership checks as logo/hero images.
- Authenticated, ownership-checked draft rendering with nonce CSP. Public JavaScript is a fixed, application-owned file; arbitrary customer scripts/markup remain forbidden. Asset delivery allowlists exact application filenames before session middleware. Vite proxies the same asset path in development.
- Example content exists only in the isolated visual fixture. It is not seeded into real shop websites. Discounts are derived from owner-configured original/current pricing; announcements and labels are owner-configured. No invented delivery promises, rankings or countdowns are applied automatically.

## Verification actually executed

- `npm test`: 212 passed, 5 skipped, 0 failed (`reports/premium-restaurant-regression.log`). PostgreSQL opt-in checks are not rerun in this command.
- Scoped ESLint: passed for Website Moon JSX and Vite config.
- Frontend production build: passed (`reports/premium-restaurant-build.log`).
- `node frontend/tests/website-premium.cjs`: passed gallery registration, thumbnail, presets, live preview, edits, photos, draft save, private preview search, publish, anonymous access, filters/reset, product details/Escape, mobile nav, loaded images, no cart/checkout and no browser errors (`reports/premium-restaurant-browser-final.log`).
- `node frontend/tests/website-moon.cjs`: existing three-template workflow regression passed (`reports/premium-restaurant-existing-browser.log`).
- Actual localhost responses: new hero asset 200; editor route 200.
- Actual rendered screenshots: `reports/website-moon/premium-published-desktop.png`, `premium-published-mobile.png`, `premium-editor-desktop.png`; template example screenshots and thumbnail are also saved.

## Use

Open `/app/moons/website`, choose **1. Template -> Premium Restaurant**, then Basic Edit. New unsaved websites receive the red/yellow preset on selection; switching an existing website preserves its brand settings. Import the shop menu and choose/upload actual product photos. Save, privately preview and publish as usual. Refresh the browser to load the built assets; backend restart is required only if an older running Node process has not loaded the new registry/routes. No shop publication, production deployment or live R2 write was performed for verification.

## Deliberate V1 limits

No cart, checkout, payments, customer accounts, branch ordering or order tracking. The reference board's later ordering screens remain future phases, as the supplied brief explicitly requires. Real domain/TLS deployment and live R2 integration verification remain separate rollout gates. Product labels/offers are owner's assertions, not automatically verified sales rankings. Product/photo snapshot changes require republishing. Shared example product photos must be replaced where they do not accurately depict a restaurant's food.
