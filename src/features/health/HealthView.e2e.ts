import { expect, test } from "@playwright/test";

test("shows the server as ok when it answers", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByText("Server: ok")).toBeVisible();
});

test("shows the check while the answer is on its way", async ({ page }) => {
	await page.route("**/api/health", () => {
		// Never answered, so the page stays in its loading state.
	});

	await page.goto("/");

	await expect(page.getByText("Checking the server")).toBeVisible();
});

test("shows the server as unreachable when it answers with an error", async ({
	page,
}) => {
	await page.route("**/api/health", (route) => route.fulfill({ status: 500 }));

	await page.goto("/");

	await expect(page.getByText("Server: unreachable")).toBeVisible();
});

test("shows the server as unreachable when it does not answer", async ({
	page,
}) => {
	await page.route("**/api/health", (route) => route.abort());

	await page.goto("/");

	await expect(page.getByText("Server: unreachable")).toBeVisible();
});
