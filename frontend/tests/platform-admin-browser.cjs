const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const base = process.env.ADMIN_PREVIEW_URL || "http://127.0.0.1:5200/app/admin";
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    let role = "superadmin",
      failStats = false,
      mutations = 0,
      protectedReads = 0;
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      let data = {};
      let status = 200;
      if (path === "/api/auth/me") {
        if (role === "anonymous") {
          status = 401;
          data = { error: "Unauthorized" };
        } else data = { user: { id: 1, role, name: "Root Admin" } };
      } else {
        protectedReads++;
        if (path === "/api/admin/store-stats") {
          if (failStats) {
            status = 500;
            data = { error: "Temporary service failure" };
          } else
            data = {
              platformRevenue: 12000,
              totalStores: 2,
              activeStores: 1,
              suspendedStores: 1,
              mrr: 6000,
              totalUsers: 8,
              totalProducts: 30,
              subRevenueTotal: 9000,
              setupFeesTotal: 3000,
              globalSales: 40000,
              growth: [
                { month: "2026-10", revenue: 5000 },
                { month: "2026-11", revenue: 7000 },
              ],
            };
        } else if (path === "/api/admin/stores")
          data = {
            total: 2,
            stores: [
              {
                id: 1,
                store_name: "Demo Restaurant",
                status: "active",
                owner_name: "Owner",
                created_at: "2026-11-01",
                product_count: 20,
                user_count: 5,
              },
            ],
          };
        else if (path === "/api/admin/financial-logs")
          data = {
            logs: [
              {
                id: 1,
                shop_name: "Demo Restaurant",
                category: "subscription",
                amount: 6000,
                created_at: "2026-11-01",
              },
            ],
          };
        else if (path === "/api/admin/activity")
          data = [
            {
              id: 1,
              action: "Status Changed",
              details: "Test activity",
              created_at: "2026-11-01",
            },
          ];
        else if (path === "/api/admin/integration-health")
          data = {
            checkedAt: "2026-11-16",
            checks: [
              {
                id: "database",
                name: "Database",
                status: "ok",
                detail: "Mocked probe succeeded",
                durationMs: 4,
              },
            ],
          };
        else if (path === "/api/admin/print-analytics/shops")
          data = {
            shops: [
              {
                id: 1,
                name: "Demo Restaurant",
                total_jobs: 10,
                failed_jobs: 0,
                pending_jobs: 0,
                printer_count: 1,
                success_rate: 100,
                agent_connected: true,
              },
            ],
          };
        else if (path === "/api/admin/print-analytics/shops/1")
          data = {
            shop: { id: 1, name: "Demo Restaurant" },
            summary: { total_jobs: 10, printed_jobs: 10, failed_jobs: 0 },
            transport: { agent_connected: true },
            daily: [],
            stations: [],
            recent_failures: [],
          };
        else if (path.endsWith("/reset-password")) {
          mutations++;
          await new Promise((resolve) => setTimeout(resolve, 150));
          data = { username: "demo-owner", newPassword: "temporary-demo-only" };
        } else if (path.endsWith("/status")) {
          mutations++;
          data = { ok: true };
        }
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    await page.getByText("Demo Restaurant", { exact: true }).first().waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(".pa-content").getBoundingClientRect().left >=
          document.querySelector(".root-sidebar").getBoundingClientRect().right,
      ),
      true,
    );
    await page.screenshot({
      path: require("node:os").tmpdir() + "/orbit-root-admin.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Restaurants", exact: true })
      .click();
    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(mutations, 0);
    await page
      .getByRole("button", { name: "Reset password for Demo Restaurant" })
      .click();
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await page.getByText("temporary-demo-only").waitFor();
    assert.equal(mutations, 1);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    for (const name of [
      "System activity",
      "Integration health",
      "Payment ledger",
      "Print analytics",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.getByRole("heading", { name, exact: true }).first().waitFor();
    }
    await page.locator(".pa-print-shop").click();
    await page.getByRole("heading", { name: "Daily print activity" }).waitFor();
    await page.getByRole("button", { name: "All restaurants" }).click();
    await page.locator(".pa-print-shop").waitFor();
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      ),
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByRole("heading", { name: "Overview", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: require("node:os").tmpdir() + "/orbit-root-admin-mobile.png",
      fullPage: true,
    });
    failStats = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByRole("alert").waitFor();
    failStats = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("Recorded platform income").waitFor();
    role = "admin";
    protectedReads = 0;
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Platform access restricted" })
      .waitFor();
    assert.equal(protectedReads, 0);
    role = "anonymous";
    await page.goto(base);
    await page.waitForURL("**/app/login");
    assert.deepEqual(failures, []);
    console.log(
      "PASS: root-only access, anonymous redirect, all tabs, cancelled mutation, password reset, print drilldown, theme, mobile navigation, API failure recovery, no page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
