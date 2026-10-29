import { expect, test } from "@playwright/test";

test.describe("admin surfaces @admin", () => {
  test("the dashboard renders with navigation and summary cards", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    for (const link of ["Products", "Orders", "Deliveries"]) {
      await expect(nav.getByRole("link", { name: link })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Inventory exceptions" })).toBeVisible();

    // Clerk loads its account UI as a separate script, so a CSP or SDK change can drop the menu
    // while every server-rendered admin page still works.
    await page.getByRole("complementary").getByRole("button", { name: "Open user menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Account panel" }).getByRole("button", { name: "Sign out" }),
    ).toBeVisible();
  });

  test("the orders list renders with workflow filters", async ({ page }) => {
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
    const filters = page.getByRole("navigation", { name: "Filter orders by workflow state" });
    await expect(filters.getByRole("link", { name: /^Needs action/ })).toBeVisible();
  });

  test("the delivery queue renders its sections", async ({ page }) => {
    await page.goto("/admin/deliveries");
    await expect(page.getByRole("heading", { name: "Delivery queue", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^To schedule/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Awaiting delivery/ })).toBeVisible();
  });
});
