import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { insertProfessional } from "../professionals/repository.server.ts";
import {
	findBookedStarts,
	insertAppointment,
	type NewAppointment,
} from "./repository.server.ts";

let db: DatabaseSync;

beforeEach(() => {
	db = memoryDatabase();
	insertProfessional(db, "Ana Costa");
	insertProfessional(db, "Rui Lopes");
});

afterEach(() => {
	db.close();
});

const appointment: NewAppointment = {
	professionalId: 1,
	startsAt: "2026-09-29T08:00:00.000Z",
	clientName: "Rita Sousa",
	clientPhone: "912345678",
	bookingCode: "K7MXQ2",
};

function rows() {
	return db
		.prepare(
			"SELECT professional_id, starts_at, client_name, client_phone, booking_code, status FROM appointment ORDER BY id",
		)
		.all();
}

it("inserts an appointment as booked", () => {
	expect(insertAppointment(db, appointment)).toEqual({
		ok: true,
		value: undefined,
	});

	expect(rows()).toEqual([
		{
			professional_id: 1,
			starts_at: "2026-09-29T08:00:00.000Z",
			client_name: "Rita Sousa",
			client_phone: "912345678",
			booking_code: "K7MXQ2",
			status: "booked",
		},
	]);
});

it("reads the professional's booked starts from an instant, ascending", () => {
	for (const [professionalId, startsAt, bookingCode] of [
		[1, "2026-09-29T09:00:00.000Z", "AAAAAA"],
		[1, "2026-09-29T07:30:00.000Z", "BBBBBB"],
		[1, "2026-09-29T08:00:00.000Z", "CCCCCC"],
		[2, "2026-09-29T08:30:00.000Z", "DDDDDD"],
	] as const) {
		insertAppointment(db, {
			...appointment,
			professionalId,
			startsAt,
			bookingCode,
		});
	}

	expect(findBookedStarts(db, 1, "2026-09-29T08:00:00.000Z")).toEqual({
		ok: true,
		value: ["2026-09-29T08:00:00.000Z", "2026-09-29T09:00:00.000Z"],
	});
	expect(findBookedStarts(db, 2, "2026-09-29T00:00:00.000Z")).toEqual({
		ok: true,
		value: ["2026-09-29T08:30:00.000Z"],
	});
});

it("refuses a second booked row on one slot as SlotTaken", () => {
	insertAppointment(db, appointment);

	expect(
		insertAppointment(db, { ...appointment, bookingCode: "ZZZZZZ" }),
	).toEqual({ ok: false, error: { code: "SlotTaken" } });
	expect(rows()).toHaveLength(1);
	expect(
		insertAppointment(db, {
			...appointment,
			professionalId: 2,
			bookingCode: "ZZZZZZ",
		}).ok,
	).toBe(true);
});

it("lets a cancelled row leave its slot free", () => {
	insertAppointment(db, appointment);
	db.prepare("UPDATE appointment SET status = 'cancelled'").run();

	expect(findBookedStarts(db, 1, "2026-09-29T00:00:00.000Z")).toEqual({
		ok: true,
		value: [],
	});
	expect(
		insertAppointment(db, { ...appointment, bookingCode: "ZZZZZZ" }).ok,
	).toBe(true);
	expect(rows()).toHaveLength(2);
});

it("fails a repeated booking code as DatabaseFailed", () => {
	insertAppointment(db, appointment);

	const repeated = insertAppointment(db, {
		...appointment,
		startsAt: "2026-09-29T08:30:00.000Z",
	});

	expect(repeated.ok).toBe(false);
	if (!repeated.ok) {
		expect(repeated.error.code).toBe("DatabaseFailed");
		expect(repeated).toMatchObject({
			error: { message: expect.stringContaining("booking_code") },
		});
	}
	expect(rows()).toHaveLength(1);
});
