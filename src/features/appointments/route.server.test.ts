import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { saveClinicAndOwner } from "../clinic/repository.server.ts";
import {
	insertProfessional,
	setRemovedAt,
} from "../professionals/repository.server.ts";
import { replaceWorkingPeriods } from "../weeklyHours/repository.server.ts";
import { appointmentsRoute } from "./route.server.ts";

// Monday 28 September 2026, 01:00 in Lisbon.
const now = new Date("2026-09-28T00:00:00.000Z");

let db: DatabaseSync;
let app: Hono;

function setUpClinic() {
	saveClinicAndOwner(db, {
		name: "Clinica Sol",
		timeZone: "Europe/Lisbon",
		slotMinutes: 30,
		email: "owner@example.com",
		passwordHash: "unused",
	});
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(now);
	db = memoryDatabase();
	app = new Hono().route("/api", appointmentsRoute(db));
	setUpClinic();
	// 1 works on Tuesdays 09:00 to 11:00; 2 has no hours; 3 is removed.
	insertProfessional(db, "Ana Lima");
	insertProfessional(db, "Rui Lopes");
	insertProfessional(db, "Eva Reis");
	replaceWorkingPeriods(db, 1, [{ weekday: 2, start: "09:00", end: "11:00" }]);
	replaceWorkingPeriods(db, 3, [{ weekday: 2, start: "09:00", end: "11:00" }]);
	setRemovedAt(db, 3, "2026-09-27T10:00:00.000Z");
});

afterEach(() => {
	db.close();
	vi.useRealTimers();
});

const tuesday = [
	"2026-09-29T08:00:00.000Z",
	"2026-09-29T08:30:00.000Z",
	"2026-09-29T09:00:00.000Z",
	"2026-09-29T09:30:00.000Z",
];

const valid = {
	professionalId: 1,
	startsAt: tuesday[0],
	clientName: " Rita Sousa ",
	clientPhone: "+351 912 345 678",
};

function slots(id: string) {
	return app.request(`/api/professionals/${id}/slots`);
}

function post(body: unknown) {
	return app.request("/api/appointments", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

function rows() {
	return db
		.prepare(
			"SELECT professional_id, starts_at, client_name, client_phone, booking_code, status FROM appointment ORDER BY id",
		)
		.all();
}

async function expectError(response: Response, status: number, code: string) {
	expect(response.status).toBe(status);
	expect(await response.json()).toEqual({ error: { code } });
}

describe("GET /api/professionals/:id/slots", () => {
	it("answers the clinic time zone and the free slot starts, ascending", async () => {
		const response = await slots("1");

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.timeZone).toBe("Europe/Lisbon");
		// Five Tuesdays in the window, four slots each.
		expect(body.slots).toHaveLength(20);
		expect(body.slots.slice(0, 4)).toEqual(tuesday);
		expect([...body.slots].sort()).toEqual(body.slots);
	});

	it("answers no slots for a professional without hours", async () => {
		const response = await slots("2");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			timeZone: "Europe/Lisbon",
			slots: [],
		});
	});

	it("leaves out booked slots", async () => {
		await post(valid);

		const body = await (await slots("1")).json();

		expect(body.slots.slice(0, 3)).toEqual(tuesday.slice(1));
	});

	it("answers 404 to an unknown, removed or non-numeric id", async () => {
		for (const id of ["9", "3", "abc", "0", "01", "1.5", "-1"]) {
			await expectError(await slots(id), 404, "ProfessionalNotFound");
		}
	});

	it("answers 404 before setup, and 500 for a professional without a clinic", async () => {
		db.close();
		db = memoryDatabase();
		app = new Hono().route("/api", appointmentsRoute(db));

		await expectError(await slots("1"), 404, "ProfessionalNotFound");

		insertProfessional(db, "Ana Lima");
		await expectError(await slots("1"), 500, "ClinicNotSetUp");
	});
});

describe("POST /api/appointments", () => {
	it("books: 201 with the code, the start, the phone digits and the professional", async () => {
		const response = await post({
			...valid,
			startsAt: "2026-09-29T09:00:00+01:00",
		});

		expect(response.status).toBe(201);
		const body = await response.json();
		expect(body).toEqual({
			bookingCode: expect.stringMatching(
				/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/,
			),
			startsAt: tuesday[0],
			clientPhone: "351912345678",
			professional: { id: 1, name: "Ana Lima" },
		});
		expect(rows()).toEqual([
			{
				professional_id: 1,
				starts_at: tuesday[0],
				client_name: "Rita Sousa",
				client_phone: "351912345678",
				booking_code: body.bookingCode,
				status: "booked",
			},
		]);
	});

	it("draws a different code for each booking", async () => {
		const codes = new Set<string>();
		for (const startsAt of tuesday) {
			const response = await post({ ...valid, startsAt });
			codes.add((await response.json()).bookingCode);
		}

		expect(codes.size).toBe(4);
	});

	it("answers 400 BadRequest to a body of the wrong shape, storing nothing", async () => {
		for (const body of [
			"not json",
			[],
			{},
			{ ...valid, professionalId: "1" },
			{ ...valid, professionalId: 0 },
			{ ...valid, professionalId: 1.5 },
			{ ...valid, professionalId: undefined },
			{ ...valid, startsAt: "tomorrow" },
			{ ...valid, startsAt: 1790000000000 },
			{ ...valid, clientName: null },
			{ ...valid, clientPhone: 912345678 },
		]) {
			await expectError(await post(body), 400, "BadRequest");
		}
		expect(rows()).toEqual([]);
	});

	it("answers 404 to an unknown or removed professional, storing nothing", async () => {
		for (const professionalId of [9, 3]) {
			await expectError(
				await post({ ...valid, professionalId }),
				404,
				"ProfessionalNotFound",
			);
		}
		expect(rows()).toEqual([]);
	});

	it("answers 404 before setup", async () => {
		db.close();
		db = memoryDatabase();
		app = new Hono().route("/api", appointmentsRoute(db));

		await expectError(await post(valid), 404, "ProfessionalNotFound");
	});

	it("answers each refusal of the use case, storing nothing", async () => {
		await post({ ...valid, startsAt: tuesday[1] });
		const before = rows();

		for (const [body, status, code] of [
			[{ ...valid, clientName: "  " }, 400, "InvalidClientName"],
			[{ ...valid, clientName: "a".repeat(81) }, 400, "InvalidClientName"],
			[{ ...valid, clientPhone: "12345" }, 400, "InvalidPhoneNumber"],
			[{ ...valid, clientPhone: "91a2345678" }, 400, "InvalidPhoneNumber"],
			[
				{ ...valid, startsAt: "2026-09-22T08:00:00.000Z" },
				409,
				"OutsideBookingWindow",
			],
			[
				{ ...valid, startsAt: "2026-10-29T09:00:00.000Z" },
				409,
				"OutsideBookingWindow",
			],
			[
				{ ...valid, startsAt: "2026-09-29T08:10:00.000Z" },
				409,
				"OutsideWorkingHours",
			],
			[
				{ ...valid, professionalId: 2, startsAt: tuesday[0] },
				409,
				"OutsideWorkingHours",
			],
			[{ ...valid, startsAt: tuesday[1] }, 409, "SlotTaken"],
		] as const) {
			await expectError(await post(body), status, code);
		}
		expect(rows()).toEqual(before);
	});

	it("checks the body, then the professional, then the rule", async () => {
		await expectError(
			await post({ ...valid, professionalId: 9, startsAt: "x" }),
			400,
			"BadRequest",
		);
		await expectError(
			await post({ ...valid, professionalId: 9, clientName: "" }),
			404,
			"ProfessionalNotFound",
		);
		await expectError(
			await post({ ...valid, clientName: "", clientPhone: "x" }),
			400,
			"InvalidClientName",
		);
	});

	it("stores exactly one of two bookings racing for one slot", async () => {
		const [first, second] = await Promise.all([
			post(valid),
			post({ ...valid, clientName: "Other" }),
		]);

		expect([first.status, second.status].sort()).toEqual([201, 409]);
		const refused = first.status === 409 ? first : second;
		expect(await refused.json()).toEqual({ error: { code: "SlotTaken" } });
		expect(rows()).toHaveLength(1);
	});

	it("keeps an appointment whose time leaves the weekly hours, and offers it no more", async () => {
		await post(valid);

		replaceWorkingPeriods(db, 1, []);

		expect(rows()).toHaveLength(1);
		expect((await (await slots("1")).json()).slots).toEqual([]);
	});
});
