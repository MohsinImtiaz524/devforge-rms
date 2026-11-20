const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const base = process.env.ADMIN_PREVIEW_ORIGIN || "http://127.0.0.1:5200";
const shop = {
  id: 2,
  name: "Orbit Cafe",
  store_name: "Orbit Cafe",
  status: "active",
  shop_type: "restaurant",
  allowed_panels: ["pos", "reports"],
  allowed_order_types: ["takeaway", "delivery"],
  created_at: "2026-11-01",
};
const root = {
  id: 1,
  name: "Root Admin",
  username: "root",
  role: "superadmin",
};
const owner = {
  id: 20,
  name: "Owner",
  username: "owner",
  role: "admin",
  shop_id: 2,
  shop_name: shop.name,
  status: "active",
  allowed_panels: ["pos"],
  roles: [{ id: 3, name: "Restaurant Admin" }],
};
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(10000);
    const errors = [],
      mutations = [],
      navigations = [];
    let paymentFailure = false,
      role = "superadmin";
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        pathname = url.pathname;
      let data = {},
        status = 200;
      if (!["GET", "HEAD"].includes(req.method())) {
        mutations.push({
          path: pathname,
          method: req.method(),
          body: req.postDataJSON(),
        });
        if (pathname === "/api/admin/financial-logs" && paymentFailure) {
          status = 500;
          data = { error: "Payment service unavailable" };
        } else data = { ok: true, id: 100 };
      } else if (pathname === "/api/auth/me")
        data = { user: { ...root, role } };
      else if (pathname === "/api/admin/store-stats")
        data = { totalStores: 1, activeStores: 1, growth: [] };
      else if (pathname === "/api/admin/stores")
        data = { stores: [shop], total: 1 };
      else if (pathname === "/api/shops") data = [shop];
      else if (pathname === "/api/admin/hierarchy-data")
        data = {
          shops: [{ ...shop, allowed_order_types: undefined }],
          users: [owner],
          systemUsers: [root],
          brands: [
            {
              id: 4,
              shop_id: 2,
              name: "Owner partner",
              ownership_percent: 100,
              is_owner_partner: true,
            },
          ],
        };
      else if (pathname === "/api/admin/financial-logs")
        data = {
          logs: [
            {
              id: 9,
              shop_id: 2,
              shop_name: shop.name,
              amount: 5000,
              category: "subscription",
              payment_method: "Bank",
              subscription_type: "1_month",
              subscription_month: "2026-11",
              subscription_start_date: "2026-11-01",
              created_at: "2026-11-01",
              description: "Monthly subscription",
            },
          ],
        };
      else if (pathname === "/api/users") data = [root, owner];
      else if (pathname === "/api/roles")
        data = [
          { id: 3, name: "Restaurant Admin", permissions: ["orders.view"] },
        ];
      else if (pathname === "/api/roles/catalog")
        data = [{ key: "orders.view", label: "View orders" }];
      else if (pathname === "/api/notifications")
        data = [
          {
            id: 11,
            title: "Test broadcast",
            message: "A platform message",
            priority: "normal",
            type: "announcement",
            status: "active",
            created_at: "2026-11-01",
            shop_id: null,
          },
        ];
      else if (pathname === "/api/auth/sessions")
        data = [
          {
            device_id: "device-1",
            is_current: true,
            user_agent: "Test browser",
          },
        ];
      else if (pathname === "/api/auth/security-events") data = [];
      else if (pathname === "/api/expenses/categories")
        data = [{ id: 6, name: "Utilities", is_active: true }];
      else if (pathname === "/api/moons/admin")
        data = { items: [], files_enabled: false };
      else if (pathname === "/api/announcements/admin") data = { items: [] };
      else if (pathname === "/api/announcements/admin/options")
        data = {
          shop_types: [],
          roles: [],
          permissions: [],
          files_enabled: false,
        };
      else if (pathname === "/api/admin/request-monitor")
        data = { cards: { http: { count: 4 } }, checkedAt: "2026-11-16" };
      else if (pathname === "/api/admin/integration-health")
        data = { checks: [] };
      else if (pathname === "/api/admin/print-analytics/shops")
        data = { shops: [] };
      else if (
        pathname.startsWith("/api/activity-logs") ||
        pathname === "/api/admin/activity" ||
        pathname.startsWith("/api/shifts/")
      )
        data = [];
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const open = async (path) => {
      console.log("Checking root page:", path);
      await page.goto(base + "/app/admin/" + path);
      await page.locator(".root-sidebar").waitFor();
    };
    await open("hierarchy");
    await page
      .getByRole("button", { name: "Manage Restaurant", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Restaurant administrators" })
      .waitFor();
    if (process.env.ADMIN_SCREENSHOT_PATH) {
      await page.screenshot({
        path: process.env.ADMIN_SCREENSHOT_PATH,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Remove restaurant", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Confirm", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    assert.equal(
      await page
        .getByRole("button", { name: "Confirm", exact: true })
        .isEnabled(),
      true,
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Staff & employees", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Staff & employees", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Admin management", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "pos", exact: true })
        .isChecked(),
      true,
    );
    await page
      .getByRole("button", { name: "Back to hierarchy", exact: true })
      .click();
    assert.equal(mutations.length, 0);
    await page.getByRole("button", { name: "New shop", exact: true }).click();
    await page.getByLabel("Restaurant name", { exact: true }).fill("New Cafe");
    await page
      .getByLabel("Administrator username", { exact: true })
      .fill("new-cafe");
    await page
      .getByLabel("Administrator password", { exact: true })
      .fill("secret-only-in-test");
    await page.getByRole("checkbox", { name: "pos", exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(mutations.at(-1).path, "/api/shops");
    assert.equal(mutations.at(-1).body.name, "New Cafe");
    await open("subscriptions");
    await page
      .getByRole("button", { name: "Add payment", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Category", { exact: true })
      .selectOption("setup");
    await page.getByLabel("Amount", { exact: true }).fill("1500");
    paymentFailure = true;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").getByRole("alert").waitFor();
    paymentFailure = false;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(mutations.at(-1).body.amount, 1500);
    await open("users");
    await page
      .getByRole("button", { name: "Create user", exact: true })
      .click();
    await page.getByLabel("Full name", { exact: true }).fill("New member");
    await page.getByLabel("Username", { exact: true }).fill("member");
    await page.getByLabel("Password", { exact: true }).fill("temporary-test");
    await page
      .getByRole("dialog")
      .getByLabel("Restaurant", { exact: true })
      .selectOption("2");
    await page.getByLabel("Assigned role", { exact: true }).selectOption("3");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(mutations.at(-1).body.role_ids, [3]);
    assert.equal(mutations.at(-1).body.shop_id, 2);
    await page
      .getByRole("button", { name: "Create role", exact: true })
      .click();
    await page.getByLabel("Role name", { exact: true }).fill("Read only");
    await page.getByLabel("View orders", { exact: true }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(mutations.at(-1).path, "/api/roles");
    await open("notifications");
    await page
      .getByRole("button", { name: "Create notification", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("New broadcast");
    await page
      .getByLabel("Message", { exact: true })
      .fill("A new root broadcast");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(mutations.at(-1).path, "/api/notifications");
    await open("categories");
    await page
      .getByRole("button", { name: "Add category", exact: true })
      .click();
    await page.getByLabel("Category name", { exact: true }).fill("Rent");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(mutations.at(-1).path, "/api/expenses/categories");
    for (const path of [
      "logs",
      "settings",
      "requests",
      "moons",
      "announcements",
    ]) {
      await open(path);
      await page.locator(".pa-content").waitFor();
      const loaded = {
        logs: ".pa-filter-form",
        settings: ".pa-settings-body",
        requests: ".pa-request-section",
        moons: ".moons-shell > p",
        announcements: ".announcement-admin-table",
      };
      await page.locator(loaded[path]).waitFor();
      assert.equal(
        await page.locator(".pa-content .vanilla-topbar").count(),
        0,
      );
      await page.locator(".pa-content").screenshot({
        path: require("node:os").tmpdir() + "/root-" + path + ".png",
      });
    }
    await page
      .getByRole("button", { name: "Restaurant management", exact: true })
      .click();
    await page.waitForURL("**/app/admin/hierarchy");
    await page
      .getByRole("heading", { name: "Master platform hierarchy", exact: true })
      .waitFor();
    await page.goBack();
    await page.waitForURL("**/app/admin/announcements");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Users & access", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Users and access", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    role = "admin";
    const before = mutations.length;
    await page.goto(base + "/app/admin/users");
    await page
      .getByRole("heading", { name: "Platform access restricted", exact: true })
      .waitFor();
    assert.equal(mutations.length, before);
    assert.equal(
      navigations.some(
        (url) =>
          url.includes("/dashboard") || url.includes("/admin/store-monitoring"),
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: root management deep links, hierarchy/access preservation, restaurant creation, payment failure/retry, users/roles, notifications, categories, all root destinations, Back navigation, mobile, tenant denial, no legacy navigation.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
