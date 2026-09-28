import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashToken, saveSession } from "../../server/session.server.ts";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { saveClinicAndOwner } from "../clinic/repository.server.ts";
import {
	insertProfessional,
	setRemovedAt,
} from "../professionals/repository.server.ts";
import { replaceWorkingPeriods } from "./repository.server.ts";
import { weeklyHoursRoute } from "./route.server.ts";
import type { WorkingPeriod } from "./rules.ts";

const token = "live-token";

let db: DatabaseSync;
let app: Hono;

const week: WorkingPeriod[] = [
	{ weekday: 1, start: "09:00", end: "13:00" },
	{ weekday: 1, start: "14:00", end: "18:00" },
];

beforeEach(() => {
	db = memoryDatabase();
	app = new Hono().route("/api", weeklyHoursRoute(db));
	saveClinicAndOwner(db, {
		name: "Clinica Sol",
		timeZone: "Europe/Lisbon",
		slotMinutes: 30,
		email: "owner@example.com",
		passwordHash: "unused",
	});
	saveSession(db, {
		tokenHash: hashToken(token),
		createdAt: "2026-01-01T00:00:00.000Z",
		expiresAt: "2999-01-01T00:00:00.000Z",
	});
	insertProfessional(db, "Ana Costa");
	insertProfessional(db, "Rui Lopes");
	replaceWorkingPeriods(db, 1, week);
});

afterEach(() => {
	db.close();
});

type Call = { method: string; id: string; body?: unknown; signedIn?: boolean };

function call({ method, id, body, signedIn = true }: Call) {
	const headers: Record<string, string> = {};
	if (signedIn) headers.Cookie = `session=${token}`;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	return app.request(`/api/owner/professionals/${id}/hours`, {
		method,
		headers,
		body:
			body === undefined
				? undefined
				: typeof body === "string"
					? body
					: JSON.stringify(body),
	});
}

const read = (id: string, signedIn = true) =>
	call({ method: "GET", id, signedIn });

const save = (id: string, body: unknown, signedIn = true) =>
	call({ method: "PUT", id, body, signedIn });

function rows() {
	return db
		.prepare(
			"SELECT professional_id, weekday, start_time, end_time FROM working_period ORDER BY id",
		)
		.all();
}

async function expectError(response: Response, status: number, code: string) {
	expect(response.status).toBe(status);
	expect(await response.json()).toEqual({ error: { code } });
}

describe("GET /api/owner/professionals/:id/hours", () => {
	it("answers the week ordered, with slotMinutes", async () => {
		replaceWorkingPeriods(db, 1, [week[1], week[0]]);

		const response = await read("1");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ slotMinutes: 30, periods: week });
	});

	it("answers an empty list when there is none", async () => {
		const response = await read("2");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ slotMinutes: 30, periods: [] });
	});

	it("answers 404 to an unknown, removed or non-numeric id", async () => {
		setRemovedAt(db, 1, "2026-09-28T10:15:00.000Z");

		for (const id of ["9", "1", "abc", "0", "01", "1.5"]) {
			await expectError(await read(id), 404, "ProfessionalNotFound");
		}
	});

	it("answers 401 NotSignedIn before anything else", async () => {
		await expectError(await read("1", false), 401, "NotSignedIn");
		await expectError(await read("abc", false), 401, "NotSignedIn");
	});
});

describe("PUT /api/owner/professionals/:id/hours", () => {
	const friday: WorkingPeriod = { weekday: 5, start: "10:00", end: "12:00" };

	it("stores the whole week and answers it ordered", async () => {
		const response = await save("1", { periods: [friday, week[1], week[0]] });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			slotMinutes: 30,
			periods: [...week, friday],
		});
		expect(rows()).toEqual([
			{
				professional_id: 1,
				weekday: 1,
				start_time: "09:00",
				end_time: "13:00",
			},
			{
				professional_id: 1,
				weekday: 1,
				start_time: "14:00",
				end_time: "18:00",
			},
			{
				professional_id: 1,
				weekday: 5,
				start_time: "10:00",
				end_time: "12:00",
			},
		]);
		const again = await read("1");
		expect(await again.json()).toEqual({
			slotMinutes: 30,
			periods: [...week, friday],
		});
	});

	it("accepts a week with no period, and leaves others' periods", async () => {
		replaceWorkingPeriods(db, 2, [friday]);

		const response = await save("1", { periods: [] });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ slotMinutes: 30, periods: [] });
		expect(rows()).toEqual([
			{
				professional_id: 2,
				weekday: 5,
				start_time: "10:00",
				end_time: "12:00",
			},
		]);
	});

	it("stores no extra field of a period", async () => {
		await save("1", { periods: [{ ...friday, id: 7, note: "x" }] });

		const response = await read("1");
		expect(await response.json()).toEqual({
			slotMinutes: 30,
			periods: [friday],
		});
	});

	it("answers 400 with the rule's code and changes no row", async () => {
		const before = rows();

		for (const [periods, code] of [
			[[{ weekday: 1, start: "09:03", end: "13:00" }], "InvalidWorkingPeriod"],
			[[{ weekday: 1, start: "", end: "13:00" }], "InvalidWorkingPeriod"],
			[[{ weekday: 1, start: "13:00", end: "09:00" }], "InvalidWorkingPeriod"],
			[[{ weekday: 1, start: "09:00", end: "09:25" }], "WorkingPeriodTooShort"],
			[
				[
					{ weekday: 1, start: "09:00", end: "13:00" },
					{ weekday: 1, start: "12:55", end: "18:00" },
				],
				"WorkingPeriodsOverlap",
			],
		] as const) {
			await expectError(await save("1", { periods }), 400, code);
		}
		expect(rows()).toEqual(before);
	});

	it("answers 404 to an unknown, removed or non-numeric id, changing no row", async () => {
		setRemovedAt(db, 1, "2026-09-28T10:15:00.000Z");
		const before = rows();

		for (const id of ["9", "1", "abc", "0", "-1"]) {
			await expectError(
				await save(id, { periods: [friday] }),
				404,
				"ProfessionalNotFound",
			);
		}
		expect(rows()).toEqual(before);
	});

	it("checks not found before the rule", async () => {
		await expectError(
			await save("9", { periods: [{ weekday: 1, start: "", end: "" }] }),
			404,
			"ProfessionalNotFound",
		);
	});

	it("answers 400 BadRequest to a body of the wrong shape, changing no row", async () => {
		const before = rows();

		for (const body of [
			"not json",
			{},
			[],
			{ periods: null },
			{ periods: {} },
			{ periods: [null] },
			{ periods: ["09:00"] },
			{ periods: [{ weekday: 0, start: "09:00", end: "13:00" }] },
			{ periods: [{ weekday: 8, start: "09:00", end: "13:00" }] },
			{ periods: [{ weekday: 1.5, start: "09:00", end: "13:00" }] },
			{ periods: [{ weekday: "1", start: "09:00", end: "13:00" }] },
			{ periods: [{ weekday: 1, start: 900, end: "13:00" }] },
			{ periods: [{ weekday: 1, start: "09:00" }] },
		]) {
			await expectError(await save("1", body), 400, "BadRequest");
		}
		expect(rows()).toEqual(before);
	});

	it("checks the body before not found", async () => {
		await expectError(await save("9", { periods: 1 }), 400, "BadRequest");
		await expectError(await save("abc", "not json"), 400, "BadRequest");
	});

	it("answers 401 NotSignedIn before anything else, changing no row", async () => {
		const before = rows();

		await expectError(
			await save("1", { periods: [friday] }, false),
			401,
			"NotSignedIn",
		);
		await expectError(await save("abc", "not json", false), 401, "NotSignedIn");
		expect(rows()).toEqual(before);
	});
});
