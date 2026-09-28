import { expect, test } from "@playwright/test";
import { e2eClinic } from "../../server/e2eClinic.server.ts";

test("shows the clinic's name as the heading", async ({ page }) => {
	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: e2eClinic.name, exact: true }),
	).toBeVisible();
	await expect(page.getByText("Server: ok")).toBeVisible();
	await expect(page.getByText("This clinic is not set up yet.")).toHaveCount(0);
});

test("shows the home page at any path other than /owner", async ({ page }) => {
	await page.goto("/some/other/path");

	await expect(
		page.getByRole("heading", { name: e2eClinic.name, exact: true }),
	).toBeVisible();
	await expect(page.getByText("Server: ok")).toBeVisible();
});

test("shows Clinic and the not set up line before setup", async ({ page }) => {
	await page.route("**/api/clinic", (route) =>
		route.fulfill({
			status: 404,
			json: { error: { code: "ClinicNotSetUp" } },
		}),
	);

	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: "Clinic", exact: true }),
	).toBeVisible();
	await expect(page.getByText("This clinic is not set up yet.")).toBeVisible();
});

test("shows Clinic while the name is on its way", async ({ page }) => {
	await page.route("**/api/clinic", () => {
		// Never answered, so the heading stays in its loading state.
	});

	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: "Clinic", exact: true }),
	).toBeVisible();
	await expect(page.getByText("Server: ok")).toBeVisible();
});

test("shows Clinic when the server cannot be reached", async ({ page }) => {
	await page.route("**/api/clinic", (route) => route.abort());
	await page.route("**/api/health", (route) => route.abort());

	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: "Clinic", exact: true }),
	).toBeVisible();
	await expect(page.getByText("Server: unreachable")).toBeVisible();
	await expect(page.getByText("This clinic is not set up yet.")).toHaveCount(0);
});
