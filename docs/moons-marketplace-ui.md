# Moons marketplace UI

The shop directory at /app/moons now follows the supplied OrbitOS marketplace reference. Its sidebar contains only Discover, My Moons, Integrations, Subscriptions, Moons help and a return-to-workspace link. It does not duplicate POS, Inventory, Customers or other outer navigation.

Published catalog metadata drives the cards and prices. Existing R2 catalog icon/cover references populate artwork; simple placeholders appear when artwork is missing or fails to load. Hero artwork uses available catalog images. No extra upload pipeline or sample Moon records were created.

Search/category filtering, synchronized sidebar/tabs, details dialogs, theme persistence, keyboard dismissal/focus handling, mobile navigation and retry states are implemented. Subscription and integration actions explain that those workflows are coming soon. Existing Analytics permissions do not create an Active subscription badge or increase the My Moons count.

The Analytics panel, its original files and its Moon copy are unchanged by this UI redesign.

Verification: production build, changed-file lint, marketplace desktop/mobile/dark-mode browser checks, Analytics copy/navigation checks and backend regression suite (169 passed, 3 skipped). Browser screenshots in reports/moons-marketplace use explicit mock catalog data to demonstrate a populated layout; these examples were not seeded into the live catalog. Real R2 artwork remains subject to staging verification.
The compact layout update removes decorative circular Moon artwork and orbit shapes. Hero and card artwork now use uncropped image slots with object-fit: contain and no circular mask, preserving transparent PNG canvases from the existing catalog uploader. Missing artwork shows a neutral image placeholder. Sidebar, type, hero, cards, icons and spacing are reduced through responsive component sizing rather than browser/CSS zoom; mobile controls retain usable dimensions.
