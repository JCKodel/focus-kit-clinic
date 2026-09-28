import { createHash } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { openDatabase } from "../../server/database.server.ts";
import {
	e2eClinic,
	e2eDatabasePath,
	signIn,
} from "../../server/e2eClinic.server.ts";

async function expectSignedOut(page: Page) {
	await expect(
		page.getByRole("heading", { name: "Owner sign-in" }),
	).toBeVisible();
	await expect(page.getByLabel("Email")).toBeVisible();
	await expect(page.getByLabel("Password")).toBeVisible();
	await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

async function expectSignedIn(page: Page) {
	await expect(page.getByText(`Signed in as ${e2eClinic.email}`)).toBeVisible();
	await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function sessionToken(page: Page): Promise<string> {
	const cookies = await page.context().cookies();
	const session = cookies.find((cookie) => cookie.name === "session");
	expect(session).toBeDefined();
	return session?.value ?? "";
}

// The message sits above the element: its top is higher on the page.
async function expectAbove(page: Page, text: string, below: string) {
	const message = await page.getByText(text).boundingBox();
	const target = await page.locator(below).first().boundingBox();
	expect(message && target && message.y < target.y).toBe(true);
}

test("shows the sign-in form when signed out", async ({ page }) => {
	await page.goto("/owner");

	await expectSignedOut(page);
});

test("signs in with the right email and password", async ({ page }) => {
	await page.goto("/owner");

	await signIn(page, e2eClinic.email, e2eClinic.password);

	await expectSignedIn(page);
});

test("matches the email in any case and with surrounding spaces", async ({
	page,
}) => {
	await page.goto("/owner");

	await signIn(page, "  OWNER@Example.COM ", e2eClinic.password);

	await expectSignedIn(page);
});

test("refuses a wrong password and keeps the email typed", async ({ page }) => {
	await page.goto("/owner");

	await signIn(page, e2eClinic.email, "wrong password!");

	await expect(page.getByText("Wrong email or password.")).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveValue(e2eClinic.email);
});

test("refuses a wrong email with the same message", async ({ page }) => {
	await page.goto("/owner");

	await signIn(page, "someone@example.com", e2eClinic.password);

	await expect(page.getByText("Wrong email or password.")).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveValue("someone@example.com");
});

test("stays signed in after a reload", async ({ page }) => {
	await page.goto("/owner");
	await signIn(page, e2eClinic.email, e2eClinic.password);
	await expectSignedIn(page);

	await page.reload();

	await expectSignedIn(page);
});

test("signs out, and the old cookie no longer opens a session", async ({
	page,
}) => {
	await page.goto("/owner");
	await signIn(page, e2eClinic.email, e2eClinic.password);
	await expectSignedIn(page);
	const [oldCookie] = (await page.context().cookies()).filter(
		(cookie) => cookie.name === "session",
	);

	await page.getByRole("button", { name: "Sign out" }).click();

	await expectSignedOut(page);
	await page.reload();
	await expectSignedOut(page);

	await page.context().addCookies([oldCookie]);
	await page.reload();
	await expectSignedOut(page);
});

test("shows the form for a session older than 30 days", async ({ page }) => {
	await page.goto("/owner");
	await signIn(page, e2eClinic.email, e2eClinic.password);
	await expectSignedIn(page);
	const tokenHash = createHash("sha256")
		.update(await sessionToken(page))
		.digest("hex");

	const opened = openDatabase(e2eDatabasePath);
	expect(opened.ok).toBe(true);
	if (!opened.ok) return;
	const db = opened.value;
	db.prepare(
		"UPDATE session SET created_at = ?, expires_at = ? WHERE token_hash = ?",
	).run("2020-01-01T00:00:00.000Z", "2020-01-31T00:00:00.000Z", tokenHash);
	db.close();
	await page.reload();

	await expectSignedOut(page);
});

test("shows the check while the session answer is on its way", async ({
	page,
}) => {
	await page.route("**/api/owner/session", () => {
		// Never answered, so the screen stays in its loading state.
	});

	await page.goto("/owner");

	await expect(page.getByText("Checking your session")).toBeVisible();
});

test("disables the button while signing in", async ({ page }) => {
	await page.route("**/api/owner/sign-in", () => {
		// Never answered, so the screen stays in its signing in state.
	});
	await page.goto("/owner");

	await signIn(page, e2eClinic.email, e2eClinic.password);

	await expect(page.getByRole("button", { name: "Signing in" })).toBeDisabled();
});

test("says the server cannot be reached when the session check fails", async ({
	page,
}) => {
	await page.route("**/api/owner/session", (route) => route.abort());

	await page.goto("/owner");

	await expectSignedOut(page);
	await expectAbove(page, "The server cannot be reached. Try again.", "form");
});

test("says the server cannot be reached when sign-in fails", async ({
	page,
}) => {
	await page.goto("/owner");
	await page.route("**/api/owner/sign-in", (route) => route.abort());

	await signIn(page, e2eClinic.email, e2eClinic.password);

	await expect(
		page.getByText("The server cannot be reached. Try again."),
	).toBeVisible();
	await expectAbove(page, "The server cannot be reached. Try again.", "form");
	await expect(page.getByLabel("Email")).toHaveValue(e2eClinic.email);
});

test("says the server cannot be reached when sign-out fails", async ({
	page,
}) => {
	await page.goto("/owner");
	await signIn(page, e2eClinic.email, e2eClinic.password);
	await expectSignedIn(page);
	await page.route("**/api/owner/sign-out", (route) => route.abort());

	await page.getByRole("button", { name: "Sign out" }).click();

	await expect(
		page.getByText("The server cannot be reached. Try again."),
	).toBeVisible();
	await expectSignedIn(page);
	await expectAbove(
		page,
		"The server cannot be reached. Try again.",
		"button:has-text('Sign out')",
	);
});
