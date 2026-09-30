import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { signIn } from "../../server/e2eClinic.server.ts";
import type { WorkingPeriod } from "./rules.ts";

// Both projects and every test share one database, so each test names its
// professionals with its own tag and looks only at those.
let tag: string;

test.beforeEach(() => {
	tag = randomUUID().slice(0, 8);
});

function tagged(name: string) {
	return `${name} ${tag}`;
}

const days = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

const invalid =
	"Use times from 00:00 to 23:55 in steps of 5 minutes, with To after From.";
const tooShort = "A period must last at least 30 minutes.";
const overlap = "This period overlaps another on the same day.";
const gone = "This professional no longer exists.";
const ended = "Your session has ended. Reload the page to sign in again.";
const unreachable = "The server cannot be reached. Try again.";

// Signs in, adds the professionals through the API and shows them in the
// list. Answers their ids, in the order given.
async function openWith(page: Page, names: string[]): Promise<number[]> {
	await page.goto("/owner");
	await signIn(page);
	await expect(
		page.getByRole("heading", { name: "Professionals" }),
	).toBeVisible();
	const ids: number[] = [];
	for (const name of names) {
		const response = await page.request.post("/api/owner/professionals", {
			data: { name },
		});
		expect(response.status()).toBe(201);
		ids.push((await response.json()).id);
	}
	await page.reload();
	for (const name of names) await expect(row(page, name)).toBeVisible();
	return ids;
}

function row(page: Page, name: string): Locator {
	return page.getByRole("listitem").filter({ hasText: name });
}

function editor(page: Page, name: string): Locator {
	return page.getByRole("region", { name: `Hours of ${name}` });
}

async function openHours(page: Page, name: string): Promise<Locator> {
	await row(page, name).getByRole("button", { name: "Hours" }).click();
	const hours = editor(page, name);
	await expect(hours.getByRole("button", { name: "Save hours" })).toBeVisible();
	return hours;
}

function day(hours: Locator, name: string): Locator {
	return hours.getByRole("group", { name });
}

function period(hours: Locator, dayName: string, index: number): Locator {
	return day(hours, dayName).getByRole("listitem").nth(index);
}

async function addPeriod(
	hours: Locator,
	dayName: string,
	start: string,
	end: string,
) {
	const count = await day(hours, dayName).getByRole("listitem").count();
	await day(hours, dayName).getByRole("button", { name: "Add period" }).click();
	const added = period(hours, dayName, count);
	await added.getByLabel("From").fill(start);
	await added.getByLabel("To").fill(end);
}

async function saveHours(hours: Locator) {
	await hours.getByRole("button", { name: "Save hours" }).click();
}

// Each day's periods as shown, "HH:MM-HH:MM", Monday first.
async function shownWeek(hours: Locator): Promise<string[][]> {
	const week: string[][] = [];
	for (const name of days) {
		const periods = day(hours, name).getByRole("listitem");
		const shown: string[] = [];
		for (let i = 0; i < (await periods.count()); i++) {
			const from = await periods.nth(i).getByLabel("From").inputValue();
			const to = await periods.nth(i).getByLabel("To").inputValue();
			shown.push(`${from}-${to}`);
		}
		week.push(shown);
	}
	return week;
}

async function hoursOnServer(page: Page, id: number): Promise<WorkingPeriod[]> {
	const response = await page.request.get(
		`/api/owner/professionals/${id}/hours`,
	);
	expect(response.status()).toBe(200);
	return (await response.json()).periods;
}

async function setHoursThroughApi(
	page: Page,
	id: number,
	periods: WorkingPeriod[],
) {
	const response = await page.request.put(
		`/api/owner/professionals/${id}/hours`,
		{ data: { periods } },
	);
	expect(response.status()).toBe(200);
}

async function removeThroughApi(page: Page, id: number) {
	const response = await page.request.delete(`/api/owner/professionals/${id}`);
	expect(response.status()).toBe(204);
}

async function box(locator: Locator) {
	const found = await locator.boundingBox();
	if (!found) throw new Error("not visible");
	return found;
}

const mondayMorning: WorkingPeriod = {
	weekday: 1,
	start: "09:00",
	end: "13:00",
};

test("shows Hours between Rename and Remove, and the week under the name, Monday first", async ({
	page,
}) => {
	const name = tagged("Ana");
	await openWith(page, [name]);
	const item = row(page, name);

	const rename = await box(item.getByRole("button", { name: "Rename" }));
	const hoursButton = await box(item.getByRole("button", { name: "Hours" }));
	const remove = await box(item.getByRole("button", { name: "Remove" }));
	expect(rename.x < hoursButton.x && hoursButton.x < remove.x).toBe(true);

	const hours = await openHours(page, name);

	expect((await box(hours)).y).toBeGreaterThan(
		(await box(item.getByText(name))).y,
	);
	expect(await hours.locator("legend").allTextContents()).toEqual(days);
	for (const dayName of days) {
		await expect(day(hours, dayName).getByText("Closed")).toBeVisible();
		await expect(
			day(hours, dayName).getByRole("button", { name: "Add period" }),
		).toBeVisible();
	}
	const save = await box(hours.getByRole("button", { name: "Save hours" }));
	const cancel = await box(hours.getByRole("button", { name: "Cancel" }));
	expect(save.y).toBeGreaterThan((await box(day(hours, "Sunday"))).y);
	expect(cancel.y).toBeGreaterThan((await box(day(hours, "Sunday"))).y);
});

test("opens one row at a time, in hours, rename or remove mode", async ({
	page,
}) => {
	const [ana, bruno] = [tagged("Ana"), tagged("Bruno")];
	await openWith(page, [ana, bruno]);

	await openHours(page, ana);
	await row(page, bruno).getByRole("button", { name: "Rename" }).click();

	await expect(editor(page, ana)).toHaveCount(0);
	await expect(page.getByLabel(`New name for ${bruno}`)).toBeVisible();

	await openHours(page, ana);
	await expect(page.getByLabel(`New name for ${bruno}`)).toHaveCount(0);

	await row(page, bruno).getByRole("button", { name: "Remove" }).click();
	await expect(editor(page, ana)).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Keep" })).toBeVisible();

	await openHours(page, ana);
	await expect(page.getByRole("button", { name: "Keep" })).toHaveCount(0);
	await expect(editor(page, bruno)).toHaveCount(0);
});

test("Add period adds 09:00 to 17:00 at the end of the day, Remove period takes it out, nothing stored", async ({
	page,
}) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	const hours = await openHours(page, name);

	await addPeriod(hours, "Monday", "07:00", "08:00");
	await day(hours, "Monday")
		.getByRole("button", { name: "Add period" })
		.click();

	await expect(period(hours, "Monday", 1).getByLabel("From")).toHaveValue(
		"09:00",
	);
	await expect(period(hours, "Monday", 1).getByLabel("To")).toHaveValue(
		"17:00",
	);
	await expect(day(hours, "Monday").getByText("Closed")).toHaveCount(0);

	await period(hours, "Monday", 0)
		.getByRole("button", { name: "Remove period" })
		.click();

	expect(await shownWeek(hours)).toEqual([
		["09:00-17:00"],
		[],
		[],
		[],
		[],
		[],
		[],
	]);
	expect(await hoursOnServer(page, id)).toEqual([]);
});

test("Save hours stores the week, closes the editor, and shows it again in order of start", async ({
	page,
}) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	const hours = await openHours(page, name);

	for (const dayName of days.slice(0, 5)) {
		await addPeriod(hours, dayName, "14:00", "18:00");
		await addPeriod(hours, dayName, "09:00", "13:00");
	}
	await saveHours(hours);

	await expect(editor(page, name)).toHaveCount(0);
	const week = [...Array(5).fill(["09:00-13:00", "14:00-18:00"]), [], []];
	expect(await shownWeek(await openHours(page, name))).toEqual(week);
	expect(await hoursOnServer(page, id)).toHaveLength(10);

	await page.reload();
	expect(await shownWeek(await openHours(page, name))).toEqual(week);
});

test("accepts back-to-back periods", async ({ page }) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	const hours = await openHours(page, name);

	await addPeriod(hours, "Tuesday", "09:00", "13:00");
	await addPeriod(hours, "Tuesday", "13:00", "18:00");
	await saveHours(hours);

	await expect(editor(page, name)).toHaveCount(0);
	expect(await hoursOnServer(page, id)).toEqual([
		{ weekday: 2, start: "09:00", end: "13:00" },
		{ weekday: 2, start: "13:00", end: "18:00" },
	]);
});

test("saving a week with no period is accepted", async ({ page }) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	await setHoursThroughApi(page, id, [mondayMorning]);
	const hours = await openHours(page, name);

	await period(hours, "Monday", 0)
		.getByRole("button", { name: "Remove period" })
		.click();
	await saveHours(hours);

	await expect(editor(page, name)).toHaveCount(0);
	expect(await hoursOnServer(page, id)).toEqual([]);
	const reopened = await openHours(page, name);
	for (const dayName of days) {
		await expect(day(reopened, dayName).getByText("Closed")).toBeVisible();
	}
});

test("refuses an empty, off-step or backwards period beside it, keeping what was typed", async ({
	page,
}) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	await setHoursThroughApi(page, id, [mondayMorning]);
	const hours = await openHours(page, name);
	await addPeriod(hours, "Wednesday", "10:00", "12:00");
	const refused = period(hours, "Wednesday", 0);

	for (const [from, to] of [
		["", "12:00"],
		["10:00", ""],
		["09:03", "12:00"],
		["12:00", "10:00"],
		["10:00", "10:00"],
	]) {
		await refused.getByLabel("From").fill(from);
		await refused.getByLabel("To").fill(to);
		await saveHours(hours);

		await expect(refused.getByText(invalid)).toBeVisible();
		await expect(refused.getByLabel("From")).toHaveValue(from);
		await expect(refused.getByLabel("To")).toHaveValue(to);
		await expect(
			hours.getByRole("button", { name: "Save hours" }),
		).toBeVisible();
	}
	expect(await hoursOnServer(page, id)).toEqual([mondayMorning]);
});

test("refuses a period shorter than the appointment length", async ({
	page,
}) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	const hours = await openHours(page, name);

	await addPeriod(hours, "Thursday", "09:00", "09:25");
	await saveHours(hours);

	await expect(period(hours, "Thursday", 0).getByText(tooShort)).toBeVisible();
	expect(await hoursOnServer(page, id)).toEqual([]);

	await period(hours, "Thursday", 0).getByLabel("To").fill("09:30");
	await saveHours(hours);
	await expect(editor(page, name)).toHaveCount(0);
});

test("refuses overlapping periods beside the later one", async ({ page }) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	const hours = await openHours(page, name);

	await addPeriod(hours, "Monday", "12:00", "18:00");
	await addPeriod(hours, "Monday", "09:00", "13:00");
	await saveHours(hours);

	await expect(period(hours, "Monday", 0).getByText(overlap)).toBeVisible();
	await expect(period(hours, "Monday", 1).getByRole("alert")).toHaveCount(0);
	await expect(period(hours, "Monday", 0).getByLabel("From")).toHaveValue(
		"12:00",
	);
	expect(await hoursOnServer(page, id)).toEqual([]);
});

test("shows a message beside the first refused period only", async ({
	page,
}) => {
	const name = tagged("Ana");
	await openWith(page, [name]);
	const hours = await openHours(page, name);

	await addPeriod(hours, "Monday", "09:00", "13:00");
	await addPeriod(hours, "Monday", "10:00", "11:00");
	await addPeriod(hours, "Friday", "14:00", "14:10");
	await addPeriod(hours, "Saturday", "16:00", "15:00");
	await saveHours(hours);

	await expect(hours.getByRole("alert")).toHaveCount(1);
	await expect(period(hours, "Friday", 0).getByText(tooShort)).toBeVisible();
});

test("Cancel closes the editor and discards every change", async ({ page }) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	await setHoursThroughApi(page, id, [mondayMorning]);
	const hours = await openHours(page, name);

	await period(hours, "Monday", 0).getByLabel("To").fill("12:00");
	await addPeriod(hours, "Tuesday", "09:00", "17:00");
	await hours.getByRole("button", { name: "Cancel" }).click();

	await expect(editor(page, name)).toHaveCount(0);
	expect(await hoursOnServer(page, id)).toEqual([mondayMorning]);
	expect(await shownWeek(await openHours(page, name))).toEqual([
		["09:00-13:00"],
		[],
		[],
		[],
		[],
		[],
		[],
	]);
});

test("saving the hours of one removed meanwhile says so and reloads the list", async ({
	page,
}) => {
	const [ana, bruno] = [tagged("Ana"), tagged("Bruno")];
	const [anaId] = await openWith(page, [ana]);
	const hours = await openHours(page, ana);
	await addPeriod(hours, "Monday", "09:00", "13:00");
	await removeThroughApi(page, anaId);
	await page.request.post("/api/owner/professionals", {
		data: { name: bruno },
	});

	await saveHours(hours);

	await expect(page.getByText(gone)).toBeVisible();
	await expect(row(page, bruno)).toBeVisible();
	await expect(row(page, ana)).toHaveCount(0);
});

test("opening the hours of one removed meanwhile says so and reloads the list", async ({
	page,
}) => {
	const ana = tagged("Ana");
	const [anaId] = await openWith(page, [ana]);
	await removeThroughApi(page, anaId);

	await row(page, ana).getByRole("button", { name: "Hours" }).click();

	await expect(page.getByText(gone)).toBeVisible();
	await expect(row(page, ana)).toHaveCount(0);
});

test("after the session ended, saving and opening say so and change nothing", async ({
	page,
}) => {
	const [ana, bruno] = [tagged("Ana"), tagged("Bruno")];
	const [anaId, brunoId] = await openWith(page, [ana, bruno]);
	await setHoursThroughApi(page, anaId, [mondayMorning]);
	const hours = await openHours(page, ana);
	await addPeriod(hours, "Tuesday", "09:00", "17:00");
	const cookies = await page.context().cookies();
	await page.context().clearCookies();

	await saveHours(hours);

	await expect(page.getByText(ended)).toBeVisible();
	expect(await shownWeek(hours)).toEqual([
		["09:00-13:00"],
		["09:00-17:00"],
		[],
		[],
		[],
		[],
		[],
	]);

	await row(page, bruno).getByRole("button", { name: "Hours" }).click();
	await expect(page.getByText(ended)).toBeVisible();
	await expect(
		editor(page, bruno).getByRole("button", { name: "Save hours" }),
	).toHaveCount(0);

	await page.context().addCookies(cookies);
	expect(await hoursOnServer(page, anaId)).toEqual([mondayMorning]);
	expect(await hoursOnServer(page, brunoId)).toEqual([]);
});

test("shows the loading line until the hours answer", async ({ page }) => {
	const name = tagged("Ana");
	await openWith(page, [name]);
	await page.route("**/api/owner/professionals/*/hours", () => {
		// Never answered, so the editor stays in its loading state.
	});

	await row(page, name).getByRole("button", { name: "Hours" }).click();

	await expect(page.getByText("Loading hours")).toBeVisible();
	await expect(page.getByRole("button", { name: "Save hours" })).toHaveCount(0);
});

test("disables every button and time input of the editor while a save is in flight", async ({
	page,
}) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	await setHoursThroughApi(page, id, [mondayMorning]);
	const hours = await openHours(page, name);
	await page.route("**/api/owner/professionals/*/hours", (route) => {
		if (route.request().method() === "GET") return route.fallback();
		// A save is never answered, so it stays in flight.
	});

	await saveHours(hours);

	const buttons = hours.getByRole("button");
	await expect(buttons.first()).toBeDisabled();
	for (const button of await buttons.all()) await expect(button).toBeDisabled();
	expect(await buttons.count()).toBe(1 + 7 + 2);

	const times = hours.locator('input[type="time"]');
	await expect(times).toHaveCount(2);
	for (const time of await times.all()) await expect(time).toBeDisabled();
});

test("says the server cannot be reached with Cancel only when the hours cannot be read", async ({
	page,
}) => {
	const name = tagged("Ana");
	await openWith(page, [name]);
	await page.route("**/api/owner/professionals/*/hours", (route) =>
		route.abort(),
	);

	await row(page, name).getByRole("button", { name: "Hours" }).click();

	const hours = editor(page, name);
	await expect(hours.getByText(unreachable)).toBeVisible();
	await expect(hours.getByRole("button")).toHaveCount(1);
	await hours.getByRole("button", { name: "Cancel" }).click();
	await expect(editor(page, name)).toHaveCount(0);
});

test("says the server cannot be reached at the top when a save fails, keeping what was typed", async ({
	page,
}) => {
	const name = tagged("Ana");
	const [id] = await openWith(page, [name]);
	const hours = await openHours(page, name);
	await addPeriod(hours, "Monday", "08:00", "12:00");
	await page.route("**/api/owner/professionals/*/hours", (route) =>
		route.abort(),
	);

	await saveHours(hours);

	const message = hours.getByText(unreachable);
	await expect(message).toBeVisible();
	expect((await box(message)).y).toBeLessThan(
		(await box(day(hours, "Monday"))).y,
	);
	expect(await shownWeek(hours)).toEqual([
		["08:00-12:00"],
		[],
		[],
		[],
		[],
		[],
		[],
	]);
	await expect(hours.getByRole("button", { name: "Save hours" })).toBeEnabled();
	await page.unroute("**/api/owner/professionals/*/hours");
	expect(await hoursOnServer(page, id)).toEqual([]);
});
