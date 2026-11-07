# Shop logo pipeline rollout

- Owner: Shops. Upload purpose: `company.logo`; attached resource: `shop.logo` with the session's shop ID. Only shop admins (or a superadmin assigned to that shop) can reserve or save logos. Same-shop authenticated users may read attached logos; other shops cannot.
- Account Profile embeds `/app/shop-logo`, reusing the shared React `FileUpload`. Existing legacy logos are previewed without rewriting them. Uploading alone changes nothing; Save publishes a verified image or explicitly removes the logo.
- The file attachment and `shops.logo_data` verified print snapshot are saved in one transaction. The snapshot preserves existing browser, server, report, and unattended-printer consumers that cannot authenticate to a private image URL. It is a compatibility projection of verified bytes, never an additional upload path. `logo_path` is cleared only on successful replacement/removal. Existing disk files are retained; there is no automatic legacy-file deletion or backfill.
- Receipt Settings manages logo visibility and proportional size, linking back to Account Profile for uploads. The additive startup migration adds `logo_print_width_mm`, default 60, validated from 10 to 110 mm. Default rendering keeps the former 60 x 22 mm bounds. This scales the display bounds, never crops or modifies the stored image.
- New profile uploads require `FILES_ENABLED=true`. Turning the flag off preserves saved logos and receipt settings but disables logo changes. Old receipt logo upload requests are rejected so they cannot overwrite the print snapshot independently of its file attachment. Receipt promotional-image uploads are unchanged.
- Saving replacement/removal schedules the previous pipeline file for existing delayed cleanup; the old logo stays attached if verification, storage reads, or the database transaction fails.

## Checks and rollout

1. Restart the backend to run the additive startup migration and register the new purpose. Build/deploy the frontend and refresh cached legacy scripts.
2. Keep R2 CORS configured for the exact live frontend origin. Existing announcement uploads use the same storage credentials and transfer flow.
3. Run `npm test`, `npm --prefix frontend run build`, and `node frontend/tests/shop-logo-smoke.cjs`. The browser test uses mocked APIs, not real shop records or R2 writes.
4. On staging, verify a shop's legacy logo first, then upload/save a replacement from Account Profile, adjust receipt size, print a receipt, and verify another shop cannot access it.
5. PostgreSQL concurrency requires a disposable `FILES_TEST_DATABASE_URL`; no production database is used for automated verification. Physical printer output and a live shop-logo upload remain deployment checks.
