import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { e2eClinic } from "../../server/e2eClinic.server.ts";
import { clinicDateOf } from "./clinicTime.ts";
import {
	allWeek,
	box,
	button,
	dayButtons,
	fill,
	openForm,
	professionalWith,
	slotsByDay,
	timeButtons,
} from "./e2e.server.ts";
import { dayLabel } from "./strings.ts";

// Both projects and every test share one database, so each test books with
// a professional of its own tag.
let tag: string;

test.beforeEach(() => {
	tag = randomUUID().slice(0, 8);
});

function tagged(name: string) {
	return `${name} ${tag}`;
}

const notFree = "This time is no longer free. Pick another.";
const unreachable = "The server cannot be reached. Try again.";
const tooLate =
	"This appointment starts in less than 24 hours and cannot be cancelled in the app.";
const badName = "Type a name of 1 to 80 characters.";
const badPhone = "Type a phone number with 6 to 15 digits.";

test("books end to end, shows the code, and remembers it after a reload", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));

	const { line } = await openForm(page, name, 1);
	await expect(page.getByText(line)).toBeVisible();
	await expect(page.getByLabel("Phone number")).toHaveAttribute("type", "tel");
	await fill(page, "Rita Sousa", "+351 912 345 678");
	await button(page, "Book").click();

	await expect(page.getByRole("heading", { name: "Booked" })).toBeVisible();
	await expect(page.getByText(line, { exact: true })).toBeVisible();
	await expect(page.getByText("Your booking code")).toBeVisible();
	const code = page.getByText(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
	await expect(code).toBeVisible();
	const bookingCode = await code.innerText();
	await expect(
		page.getByText(
			"Keep this code. With the phone number 351912345678, it identifies your appointment.",
		),
	).toBeVisible();

	await page.reload();

	const yours = page.getByRole("heading", { name: "Your appointments" });
	await expect(yours).toBeVisible();
	await expect(
		page
			.getByRole("listitem")
			.filter({ hasText: `${line} · Code ${bookingCode}` }),
	).toBeVisible();
	const book = page.getByRole("heading", { name: "Book an appointment" });
	expect((await box(yours)).y).toBeLessThan((await box(book)).y);
});

test("shows no Your appointments before a booking", async ({ page }) => {
	await page.goto("/");

	await expect(
		page.getByRole("heading", { name: "Book an appointment" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Your appointments" }),
	).toHaveCount(0);
});

test("Done returns to the professionals, and the booked time is gone for every client", async ({
	page,
	browser,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const before = await slotsByDay(page, id);

	const { dayLabel, timeLabel } = await openForm(page, name, 1);
	await fill(page, "Rita Sousa", "912345678");
	await button(page, "Book").click();
	await button(page, "Done").click();

	await expect(button(page, name)).toBeVisible();
	await button(page, name).click();
	await button(page, dayLabel).click();
	await expect(timeButtons(page).first()).toBeVisible();
	await expect(button(page, timeLabel)).toHaveCount(0);

	const after = await slotsByDay(page, id);
	expect(after[1]).toEqual(before[1].slice(1));

	const other = await browser.newPage();
	await other.goto(new URL("/", page.url()).href);
	await button(other, name).click();
	await button(other, dayLabel).click();
	await expect(timeButtons(other).first()).toBeVisible();
	await expect(button(other, timeLabel)).toHaveCount(0);
	await other.close();
});

test("lists professionals, days earliest first, and times earliest first, with Back", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	await page.goto("/");

	await button(page, name).click();
	await expect(dayButtons(page).first()).toBeVisible();
	const days = await dayButtons(page).allInnerTexts();
	const expected = (await slotsByDay(page, id)).map(([first]) =>
		dayLabel(clinicDateOf(new Date(first), e2eClinic.timeZone)),
	);
	expect(days).toEqual(expected);
	expect(days.length).toBeGreaterThanOrEqual(30);
	expect((await box(button(page, "Back"))).y).toBeLessThan(
		(await box(dayButtons(page).first())).y,
	);
	await dayButtons(page).nth(1).click();
	await expect(timeButtons(page).first()).toBeVisible();
	const times = await timeButtons(page).allInnerTexts();
	expect(times[0]).toBe("08:00");
	expect(times.at(-1)).toBe("19:30");
	expect(times).toHaveLength(24);

	await button(page, "Back").click();
	expect(await dayButtons(page).allInnerTexts()).toEqual(days);
	await button(page, "Back").click();
	await expect(button(page, name)).toBeVisible();
	await expect(dayButtons(page)).toHaveCount(0);
});

test("refuses a bad name and a bad phone beside the field, sending nothing", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));
	await openForm(page, name, 1);
	const posts: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "POST") posts.push(request.url());
	});

	await fill(page, "   ", "12345");
	await button(page, "Book").click();

	await expect(page.getByText(badName)).toBeVisible();
	await expect(page.getByText(badPhone)).toBeVisible();

	await fill(page, "Rita Sousa", "91a2345678");
	await button(page, "Book").click();

	await expect(page.getByText(badName)).toHaveCount(0);
	await expect(page.getByText(badPhone)).toBeVisible();
	await expect(page.getByLabel("Phone number")).toHaveValue("91a2345678");
	expect(posts).toEqual([]);
});

test("a time taken meanwhile says so above the day's times, reloaded", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const [, secondDay] = await slotsByDay(page, id);
	const { timeLabel } = await openForm(page, name, 1);
	await fill(page, "Rita Sousa", "912345678");
	const taken = await page.request.post("/api/appointments", {
		data: {
			professionalId: id,
			startsAt: secondDay[0],
			clientName: "Someone else",
			clientPhone: "919999999",
		},
	});
	expect(taken.status()).toBe(201);

	await button(page, "Book").click();

	const message = page.getByText(notFree);
	await expect(message).toBeVisible();
	await expect(timeButtons(page)).toHaveCount(secondDay.length - 1);
	await expect(button(page, timeLabel)).toHaveCount(0);
	expect((await box(message)).y).toBeLessThan(
		(await box(timeButtons(page).first())).y,
	);
});

test("a day with no time left shows the days with the message", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("10:00", "10:30"));
	const [, secondDay] = await slotsByDay(page, id);
	const { dayLabel } = await openForm(page, name, 1);
	await fill(page, "Rita Sousa", "912345678");
	await page.request.post("/api/appointments", {
		data: {
			professionalId: id,
			startsAt: secondDay[0],
			clientName: "Someone else",
			clientPhone: "919999999",
		},
	});

	await button(page, "Book").click();

	await expect(page.getByText(notFree)).toBeVisible();
	await expect(dayButtons(page).first()).toBeVisible();
	await expect(button(page, dayLabel)).toHaveCount(0);
	await expect(timeButtons(page)).toHaveCount(0);
});

test("a professional removed meanwhile reloads the list with the message", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	await openForm(page, name, 1);
	await fill(page, "Rita Sousa", "912345678");
	const removed = await page.request.delete(`/api/owner/professionals/${id}`);
	expect(removed.status()).toBe(204);

	await button(page, "Book").click();

	await expect(
		page.getByText("This professional is no longer available."),
	).toBeVisible();
	await expect(button(page, name)).toHaveCount(0);
	await expect(dayButtons(page)).toHaveCount(0);
});

test("a professional with no hours shows no free times", async ({ page }) => {
	const name = tagged("Ana");
	await professionalWith(page, name, []);
	await page.goto("/");

	await button(page, name).click();

	await expect(
		page.getByText("No free times in the next 30 days."),
	).toBeVisible();
	await expect(button(page, "Back")).toBeVisible();
});

test("says the appointment cannot be cancelled when it starts in less than 24 hours", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, []);
	const hour = 60 * 60 * 1000;
	const nextHour = Math.ceil(Date.now() / hour) * hour;
	const soon = new Date(nextHour + 2 * hour).toISOString();
	const later = new Date(nextHour + 72 * hour).toISOString();
	await page.route("**/api/professionals/*/slots", (route) =>
		route.fulfill({
			json: { timeZone: "Europe/Lisbon", slots: [soon, later] },
		}),
	);
	await page.goto("/");
	await button(page, name).click();

	await dayButtons(page).first().click();
	await timeButtons(page).first().click();
	await expect(page.getByText(tooLate)).toBeVisible();

	await button(page, "Back").click();
	await button(page, "Back").click();
	await dayButtons(page).last().click();
	await timeButtons(page).first().click();
	await expect(page.getByLabel("Your name")).toBeVisible();
	await expect(page.getByText(tooLate)).toHaveCount(0);
});

test("shows No professionals yet with none", async ({ page }) => {
	await page.route("**/api/professionals", (route) =>
		route.fulfill({ json: { professionals: [] } }),
	);

	await page.goto("/");

	await expect(page.getByText("No professionals yet.")).toBeVisible();
});

test("shows Loading until the professionals and the days answer", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));
	await page.route("**/api/professionals", () => {
		// Never answered, so the list stays in its loading state.
	});
	await page.goto("/");
	await expect(page.getByText("Loading", { exact: true })).toBeVisible();

	await page.unroute("**/api/professionals");
	await page.route("**/api/professionals/*/slots", () => {
		// Never answered, so the days stay in their loading state.
	});
	await page.reload();
	await button(page, name).click();

	await expect(page.getByText("Loading", { exact: true })).toBeVisible();
	await expect(button(page, "Back")).toBeVisible();
});

test("says the server cannot be reached, and Try again repeats the request", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));
	await page.goto("/");
	await expect(button(page, name)).toBeVisible();
	await page.route("**/api/professionals/*/slots", (route) => route.abort());

	await button(page, name).click();

	await expect(page.getByText(unreachable)).toBeVisible();
	await page.unroute("**/api/professionals/*/slots");
	await button(page, "Try again").click();
	await expect(page.getByText(unreachable)).toHaveCount(0);
	await expect(dayButtons(page).first()).toBeVisible();
});

test("a failed booking keeps what was typed, and Try again books", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));
	await openForm(page, name, 1);
	await fill(page, "Rita Sousa", "912345678");
	await page.route("**/api/appointments", (route) => route.abort());

	await button(page, "Book").click();

	const message = page.getByText(unreachable);
	await expect(message).toBeVisible();
	expect((await box(message)).y).toBeLessThan(
		(await box(page.getByLabel("Your name"))).y,
	);
	await expect(page.getByLabel("Your name")).toHaveValue("Rita Sousa");
	await expect(page.getByLabel("Phone number")).toHaveValue("912345678");

	await page.unroute("**/api/appointments");
	await button(page, "Try again").click();
	await expect(page.getByRole("heading", { name: "Booked" })).toBeVisible();
});

test("disables Book, Back, name and phone while a booking is in flight", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));
	await openForm(page, name, 1);
	await fill(page, "Rita Sousa", "912345678");
	await page.route("**/api/appointments", () => {
		// Never answered, so the booking stays in flight.
	});

	await button(page, "Book").click();

	await expect(button(page, "Book")).toBeDisabled();
	await expect(button(page, "Back")).toBeDisabled();
	await expect(page.getByLabel("Your name")).toBeDisabled();
	await expect(page.getByLabel("Phone number")).toBeDisabled();
});

test("professional, day and time buttons are full width and at least 44px tall", async ({
	page,
}) => {
	const name = tagged("Ana");
	await professionalWith(page, name, allWeek("08:00", "20:00"));
	await page.goto("/");

	const { width } = await box(
		page.getByRole("heading", { name: "Book an appointment" }),
	);
	for (const locator of [
		() => button(page, name),
		() => dayButtons(page).first(),
		() => timeButtons(page).first(),
	]) {
		const found = await box(locator());
		expect(found.height).toBeGreaterThanOrEqual(44);
		expect(found.width).toBe(width);
		await locator().click();
	}
});
