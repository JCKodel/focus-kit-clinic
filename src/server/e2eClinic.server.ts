import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";

// For Playwright: the clinic the run sets up with `npm run setup` before the
// server starts, and the throwaway database it lives in. Read by
// playwright.config.ts and the *.e2e.ts files, never by client code.
export const e2eDatabasePath = join(
	tmpdir(),
	"focus-kit-clinic-e2e",
	"clinic.sqlite",
);

export const e2eClinic = {
	name: "Clinica Sol",
	timeZone: "Europe/Lisbon",
	slotMinutes: "",
	email: "owner@example.com",
	password: "correct horse battery",
};

// Fills and sends the owner sign-in form at /owner. First use:
// OwnerView.e2e.ts; second use: ProfessionalsView.e2e.ts.
export async function signIn(
	page: Page,
	email = e2eClinic.email,
	password = e2eClinic.password,
) {
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
}
