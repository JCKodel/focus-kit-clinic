import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { e2eClinic } from "../../server/e2eClinic.server.ts";
import {
	allWeek,
	box,
	button,
	fill,
	openForm,
	professionalWith,
	slotsByDay,
	timeButtons,
} from "./e2e.server.ts";
import type { RememberedAppointment } from "./remembered.ts";
import { summary } from "./strings.ts";

// Both projects and every test share one database, so each test books with
// a professional of its own tag.
let tag: string;

test.beforeEach(() => {
	tag = randomUUID().slice(0, 8);
});

function tagged(name: string) {
	return `${name} ${tag}`;
}

const tooLate =
	"Appointments can be cancelled up to 24 hours before they start. This one can no longer be cancelled in the app.";
const noMatch = "No booked appointment matches this phone number and code.";
const unreachable = "The server cannot be reached. Try again.";

// A phone of its own, so a wrong code never matches another test's booking.
function randomPhone(): string {
	return `9${String(randomInt(10 ** 8)).padStart(8, "0")}`;
}

// Books `startsAt` through the API; answers what the phone would remember.
async function bookThroughApi(
	page: Page,
	professionalId: number,
	name: string,
	startsAt: string,
	clientPhone: string,
): Promise<RememberedAppointment> {
	const response = await page.request.post("/api/appointments", {
		data: { professionalId, startsAt, clientName: "Rita Sousa", clientPhone },
	});
	expect(response.status()).toBe(201);
	const booked = await response.json();
	return {
		bookingCode: booked.bookingCode,
		clientPhone: booked.clientPhone,
		professionalName: name,
		startsAt: booked.startsAt,
		timeZone: e2eClinic.timeZone,
	};
}

// Opens the home page with these appointments in the phone's storage.
async function plant(page: Page, appointments: RememberedAppointment[]) {
	await page.goto("/");
	await page.evaluate(
		(value) => localStorage.setItem("appointments", value),
		JSON.stringify(appointments),
	);
	await page.reload();
}

// An appointment only the phone knows, three days ahead.
function planted(): RememberedAppointment {
	const hour = 60 * 60 * 1000;
	const startsAt = Math.ceil(Date.now() / hour) * hour + 72 * hour;
	return {
		bookingCode: "K7MXQ2",
		clientPhone: "912345678",
		professionalName: tagged("Ana"),
		startsAt: new Date(startsAt).toISOString(),
		timeZone: e2eClinic.timeZone,
	};
}

function lineOf(a: RememberedAppointment): string {
	return summary(a.startsAt, a.timeZone, a.professionalName);
}

function yours(page: Page) {
	return page.locator("section").filter({
		has: page.getByRole("heading", { name: "Your appointments" }),
	});
}

function itemOf(page: Page, a: RememberedAppointment) {
	return yours(page)
		.getByRole("listitem")
		.filter({ hasText: lineOf(a) });
}

function cancelForm(page: Page) {
	return page.locator("section").filter({
		has: page.getByRole("heading", { name: "Cancel an appointment" }),
	});
}

async function typeAndSend(page: Page, phone: string, code: string) {
	await button(page, "Cancel with a booking code").click();
	const form = cancelForm(page);
	await form.getByLabel("Phone number").fill(phone);
	await form.getByLabel("Booking code").fill(code);
	await button(form, "Cancel appointment").click();
	return form;
}

function posts(page: Page): string[] {
	const sent: string[] = [];
	page.on("request", (request) => {
		if (request.method() === "POST") sent.push(request.url());
	});
	return sent;
}

test("books in the app, cancels from Your appointments after confirming, and the time is free again", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const before = await slotsByDay(page, id);
	// The third clinic day with slots is always more than 24 hours away.
	const { line, dayLabel, timeLabel } = await openForm(page, name, 2);
	await fill(page, "Rita Sousa", "912345678");
	await button(page, "Book").click();
	await button(page, "Done").click();
	const item = yours(page).getByRole("listitem").filter({ hasText: line });

	await button(item, "Cancel").click();

	await expect(item.getByText("Cancel this appointment?")).toBeVisible();
	await expect(button(item, "Cancel")).toHaveCount(0);
	await button(item, "Yes, cancel").click();

	await expect(
		yours(page).getByText(`Cancelled: ${line}. The time is free again.`),
	).toBeVisible();
	await expect(yours(page).getByRole("listitem")).toHaveCount(0);
	expect((await slotsByDay(page, id))[2]).toContain(before[2][0]);
	await button(page, name).click();
	await button(page, dayLabel).click();
	await expect(timeButtons(page).first()).toBeVisible();
	await expect(button(page, timeLabel)).toBeVisible();

	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Your appointments" }),
	).toHaveCount(0);
});

test("Keep it puts Cancel back and sends nothing", async ({ page }) => {
	const appointment = planted();
	await plant(page, [appointment]);
	const sent = posts(page);
	const item = itemOf(page, appointment);

	await button(item, "Cancel").click();
	await button(item, "Keep it").click();

	await expect(button(item, "Cancel")).toBeVisible();
	await expect(item.getByText("Cancel this appointment?")).toHaveCount(0);
	expect(sent).toEqual([]);
});

test("Cancel sits inline after the line, at least 44px tall, and the code button between the sections", async ({
	page,
}) => {
	const appointment = planted();
	await plant(page, [appointment]);
	const item = itemOf(page, appointment);

	const cancel = await box(button(item, "Cancel"));
	expect(cancel.height).toBeGreaterThanOrEqual(44);
	expect(cancel.width).toBeLessThan((await box(item)).width / 2);

	const withCode = await box(button(page, "Cancel with a booking code"));
	expect(withCode.height).toBeGreaterThanOrEqual(44);
	expect((await box(item)).y).toBeLessThan(withCode.y);
	expect(withCode.y).toBeLessThan(
		(await box(page.getByRole("heading", { name: "Book an appointment" }))).y,
	);
});

test("a remembered appointment no longer booked is forgotten with the message", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const [, , third] = await slotsByDay(page, id);
	const phone = randomPhone();
	const appointment = await bookThroughApi(page, id, name, third[0], phone);
	await plant(page, [appointment]);
	const elsewhere = await page.request.post("/api/appointments/cancel", {
		data: { clientPhone: phone, bookingCode: appointment.bookingCode },
	});
	expect(elsewhere.status()).toBe(200);
	const item = itemOf(page, appointment);

	await button(item, "Cancel").click();
	await button(item, "Yes, cancel").click();

	await expect(
		yours(page).getByText("This appointment is no longer booked."),
	).toBeVisible();
	await expect(item).toHaveCount(0);
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Your appointments" }),
	).toHaveCount(0);
});

test("a refusal as too late shows on the line, with no Cancel, and the phone keeps it", async ({
	page,
}) => {
	const appointment = planted();
	await plant(page, [appointment]);
	await page.route("**/api/appointments/cancel", (route) =>
		route.fulfill({
			status: 409,
			json: { error: { code: "CancellationTooLate" } },
		}),
	);
	const item = itemOf(page, appointment);

	await button(item, "Cancel").click();
	await button(item, "Yes, cancel").click();

	await expect(item.getByText(tooLate)).toBeVisible();
	await expect(button(item, "Cancel")).toHaveCount(0);
	await page.reload();
	await expect(itemOf(page, appointment)).toBeVisible();
});

test("a failed cancellation from the list says so on the line, and Try again repeats it", async ({
	page,
}) => {
	const appointment = planted();
	await plant(page, [appointment]);
	await page.route("**/api/appointments/cancel", (route) => route.abort());
	const item = itemOf(page, appointment);

	await button(item, "Cancel").click();
	await button(item, "Yes, cancel").click();

	await expect(item.getByText(unreachable)).toBeVisible();
	await page.unroute("**/api/appointments/cancel");
	await page.route("**/api/appointments/cancel", (route) =>
		route.fulfill({
			json: {
				startsAt: appointment.startsAt,
				timeZone: appointment.timeZone,
				professional: { id: 1, name: appointment.professionalName },
			},
		}),
	);
	await button(item, "Try again").click();

	await expect(
		yours(page).getByText(
			`Cancelled: ${lineOf(appointment)}. The time is free again.`,
		),
	).toBeVisible();
});

test("disables Yes, cancel and Keep it, or Cancel appointment and Back, while in flight", async ({
	page,
}) => {
	const appointment = planted();
	await plant(page, [appointment]);
	await page.route("**/api/appointments/cancel", () => {
		// Never answered, so the cancellation stays in flight.
	});
	const item = itemOf(page, appointment);

	await button(item, "Cancel").click();
	await button(item, "Yes, cancel").click();
	await expect(button(item, "Yes, cancel")).toBeDisabled();
	await expect(button(item, "Keep it")).toBeDisabled();

	const form = await typeAndSend(page, "912345678", "K7MXQ2");
	await expect(button(form, "Cancel appointment")).toBeDisabled();
	await expect(button(form, "Back")).toBeDisabled();
});

test("cancels by typing the phone with spaces and the code in lower case, and forgets it", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const [, , third] = await slotsByDay(page, id);
	const appointment = await bookThroughApi(
		page,
		id,
		name,
		third[0],
		"912345678",
	);
	await plant(page, [appointment]);
	await button(page, "Cancel with a booking code").click();
	const form = cancelForm(page);
	await expect(form.getByLabel("Phone number")).toHaveAttribute("type", "tel");
	await expect(form.getByLabel("Booking code")).toHaveAttribute(
		"autocapitalize",
		"characters",
	);
	await expect(form.getByLabel("Booking code")).toHaveAttribute(
		"autocomplete",
		"off",
	);
	await expect(
		page.getByRole("heading", { name: "Book an appointment" }),
	).toBeVisible();
	await button(form, "Back").click();

	await typeAndSend(
		page,
		"912 345 678",
		` ${appointment.bookingCode.toLowerCase()} `,
	);

	await expect(form.getByRole("heading", { name: "Cancelled" })).toBeVisible();
	await expect(
		form.getByText(lineOf(appointment), { exact: true }),
	).toBeVisible();
	await expect(form.getByText("The time is free again.")).toBeVisible();
	await expect(itemOf(page, appointment)).toHaveCount(0);
	expect((await slotsByDay(page, id))[2]).toContain(third[0]);

	await button(page, "Done").click();
	await expect(button(page, "Cancel with a booking code")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Cancel an appointment" }),
	).toHaveCount(0);
});

test("Back empties the fields", async ({ page }) => {
	await page.goto("/");
	await button(page, "Cancel with a booking code").click();
	const form = cancelForm(page);
	await form.getByLabel("Phone number").fill("912345678");
	await form.getByLabel("Booking code").fill("K7MXQ2");

	await button(form, "Back").click();
	await button(page, "Cancel with a booking code").click();

	await expect(form.getByLabel("Phone number")).toHaveValue("");
	await expect(form.getByLabel("Booking code")).toHaveValue("");
});

test("a wrong code says no appointment matches, above the form, keeping what was typed", async ({
	page,
}) => {
	const phone = randomPhone();
	await page.goto("/");

	const form = await typeAndSend(page, phone, "zzzzz2");

	const message = form.getByText(noMatch);
	await expect(message).toBeVisible();
	expect((await box(message)).y).toBeLessThan(
		(await box(form.getByLabel("Phone number"))).y,
	);
	await expect(form.getByLabel("Phone number")).toHaveValue(phone);
	await expect(form.getByLabel("Booking code")).toHaveValue("zzzzz2");
});

test("blank fields and a code that cannot be one say no appointment matches", async ({
	page,
}) => {
	await page.goto("/");

	const form = await typeAndSend(page, "", "");
	await expect(form.getByText(noMatch)).toBeVisible();

	await form.getByLabel("Phone number").fill(randomPhone());
	await form.getByLabel("Booking code").fill("K7MXQ0");
	await button(form, "Cancel appointment").click();
	await expect(form.getByText(noMatch)).toBeVisible();
});

test("an appointment under 24 hours away is refused by the typed form, and shows no Cancel when remembered", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const [[earliest]] = await slotsByDay(page, id);
	const phone = randomPhone();
	const appointment = await bookThroughApi(page, id, name, earliest, phone);
	await page.goto("/");

	const form = await typeAndSend(page, phone, appointment.bookingCode);

	await expect(form.getByText(tooLate)).toBeVisible();
	await expect(form.getByLabel("Booking code")).toHaveValue(
		appointment.bookingCode,
	);

	await plant(page, [appointment]);
	const item = itemOf(page, appointment);
	await expect(item).toBeVisible();
	await expect(
		item.getByText("Can no longer be cancelled in the app."),
	).toBeVisible();
	await expect(button(item, "Cancel")).toHaveCount(0);
});

test("a failed typed cancellation keeps what was typed, and Try again cancels", async ({
	page,
}) => {
	const name = tagged("Ana");
	const id = await professionalWith(page, name, allWeek("08:00", "20:00"));
	const [, , third] = await slotsByDay(page, id);
	const phone = randomPhone();
	const appointment = await bookThroughApi(page, id, name, third[0], phone);
	await page.goto("/");
	await page.route("**/api/appointments/cancel", (route) => route.abort());

	const form = await typeAndSend(page, phone, appointment.bookingCode);

	await expect(form.getByText(unreachable)).toBeVisible();
	await expect(form.getByLabel("Phone number")).toHaveValue(phone);
	await page.unroute("**/api/appointments/cancel");
	await button(form, "Try again").click();
	await expect(form.getByRole("heading", { name: "Cancelled" })).toBeVisible();
});
