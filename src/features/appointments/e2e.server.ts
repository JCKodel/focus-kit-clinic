import { expect, type Locator, type Page } from "@playwright/test";
import { e2eClinic } from "../../server/e2eClinic.server.ts";
import type { WorkingPeriod } from "../weeklyHours/rules.ts";
import { clinicDateOf } from "./clinicTime.ts";

// Playwright helpers of the client side. First use: BookingView.e2e.ts;
// second: CancelView.e2e.ts.

export const allWeek = (start: string, end: string): WorkingPeriod[] =>
	([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({ weekday, start, end }));

// Adds a professional with these weekly hours through the owner routes.
export async function professionalWith(
	page: Page,
	name: string,
	periods: WorkingPeriod[],
): Promise<number> {
	const signedIn = await page.request.post("/api/owner/sign-in", {
		data: { email: e2eClinic.email, password: e2eClinic.password },
	});
	expect(signedIn.status()).toBe(200);
	const added = await page.request.post("/api/owner/professionals", {
		data: { name },
	});
	expect(added.status()).toBe(201);
	const id: number = (await added.json()).id;
	const hours = await page.request.put(`/api/owner/professionals/${id}/hours`, {
		data: { periods },
	});
	expect(hours.status()).toBe(200);
	return id;
}

// The free slots of a professional, grouped by clinic date.
export async function slotsByDay(page: Page, id: number): Promise<string[][]> {
	const response = await page.request.get(`/api/professionals/${id}/slots`);
	expect(response.status()).toBe(200);
	const { timeZone, slots }: { timeZone: string; slots: string[] } =
		await response.json();
	const days = new Map<string, string[]>();
	for (const slot of slots) {
		const date = clinicDateOf(new Date(slot), timeZone);
		days.set(date, [...(days.get(date) ?? []), slot]);
	}
	return [...days.values()];
}

export function button(scope: Page | Locator, name: string): Locator {
	return scope.getByRole("button", { name, exact: true });
}

export function dayButtons(page: Page): Locator {
	return page.getByRole("button", {
		name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/,
	});
}

export function timeButtons(page: Page): Locator {
	return page.getByRole("button", { name: /^\d{2}:\d{2}$/ });
}

export async function box(locator: Locator) {
	const found = await locator.boundingBox();
	if (!found) throw new Error("not visible");
	return found;
}

// Opens the home page and the form of the first time of the day at `index`.
// Answers the summary line the form should show.
export async function openForm(page: Page, name: string, index: number) {
	await page.goto("/");
	await button(page, name).click();
	await expect(
		page.getByRole("heading", { name: `Book with ${name}` }),
	).toBeVisible();
	const day = dayButtons(page).nth(index);
	const dayLabel = await day.innerText();
	await day.click();
	const time = timeButtons(page).first();
	const timeLabel = await time.innerText();
	await time.click();
	return {
		dayLabel,
		timeLabel,
		line: `${dayLabel} at ${timeLabel} with ${name}`,
	};
}

export async function fill(page: Page, name: string, phone: string) {
	await page.getByLabel("Your name").fill(name);
	await page.getByLabel("Phone number").fill(phone);
}
