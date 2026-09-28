import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { idOf } from "../../lib/id.ts";
import { err, ok, type Result } from "../../lib/result.ts";
import { findClinic } from "../clinic/repository.server.ts";
import { findActiveProfessionals } from "../professionals/repository.server.ts";
import type { Professional } from "../professionals/rules.ts";
import { findWorkingPeriods } from "../weeklyHours/repository.server.ts";
import {
	cancelAppointment,
	findBookedAppointment,
	findBookedStarts,
	insertAppointment,
} from "./repository.server.ts";
import {
	type BookingRefusal,
	book,
	bookingCodeAlphabet,
	bookingCodeLength,
	cancel,
	checkClientPhone,
	freeSlots,
	normalizeBookingCode,
	type SlotInput,
} from "./rules.ts";

type BookingBody = {
	professionalId: number;
	startsAt: string;
	clientName: string;
	clientPhone: string;
};

function isBookingBody(body: unknown): body is BookingBody {
	if (typeof body !== "object" || body === null) return false;
	const professionalId: unknown = Reflect.get(body, "professionalId");
	const startsAt: unknown = Reflect.get(body, "startsAt");
	const clientName: unknown = Reflect.get(body, "clientName");
	const clientPhone: unknown = Reflect.get(body, "clientPhone");
	return (
		Number.isSafeInteger(professionalId) &&
		Number(professionalId) > 0 &&
		typeof startsAt === "string" &&
		!Number.isNaN(Date.parse(startsAt)) &&
		typeof clientName === "string" &&
		typeof clientPhone === "string"
	);
}

type CancelBody = { clientPhone: string; bookingCode: string };

function isCancelBody(body: unknown): body is CancelBody {
	if (typeof body !== "object" || body === null) return false;
	return (
		typeof Reflect.get(body, "clientPhone") === "string" &&
		typeof Reflect.get(body, "bookingCode") === "string"
	);
}

// The three time refusals share 409: the client shows them alike.
const refusalStatus: Record<BookingRefusal, 400 | 409> = {
	InvalidClientName: 400,
	InvalidPhoneNumber: 400,
	OutsideBookingWindow: 409,
	OutsideWorkingHours: 409,
	SlotTaken: 409,
};

function databaseFailed(c: Context) {
	return c.json({ error: { code: "DatabaseFailed" } }, 500);
}

function notFound(c: Context) {
	return c.json({ error: { code: "ProfessionalNotFound" } }, 404);
}

function appointmentNotFound(c: Context) {
	return c.json({ error: { code: "AppointmentNotFound" } }, 404);
}

function drawBookingCode(): string {
	let code = "";
	for (let i = 0; i < bookingCodeLength; i++) {
		code += bookingCodeAlphabet[randomInt(bookingCodeAlphabet.length)];
	}
	return code;
}

// What both routes read after the body: the active professional, the clinic
// and what the slots are cut from, with `now`; else the answer. Synchronous,
// so no other request of the process runs between this read and the insert.
function slotsOf(
	db: DatabaseSync,
	c: Context,
	professionalId: number | undefined,
	now: Date,
): Result<{ professional: Professional; input: SlotInput }, Response> {
	if (professionalId === undefined) return err(notFound(c));
	const active = findActiveProfessionals(db);
	if (!active.ok) return err(databaseFailed(c));
	const professional = active.value.find((p) => p.id === professionalId);
	if (!professional) return err(notFound(c));
	const clinic = findClinic(db);
	if (!clinic.ok) return err(databaseFailed(c));
	// A professional exists only once the clinic is set up; kept for the types.
	if (!clinic.value) {
		return err(c.json({ error: { code: "ClinicNotSetUp" } }, 500));
	}
	const { timeZone, slotMinutes } = clinic.value;
	const periods = findWorkingPeriods(db, professionalId);
	if (!periods.ok) return err(databaseFailed(c));
	const from = new Date(now.getTime() - slotMinutes * 60 * 1000);
	const booked = findBookedStarts(db, professionalId, from.toISOString());
	if (!booked.ok) return err(databaseFailed(c));
	return ok({
		professional,
		input: {
			periods: periods.value,
			booked: booked.value,
			timeZone,
			slotMinutes,
			now,
		},
	});
}

// The client's free slots, booking and cancellation, public. A booking checks
// in the order: body shape, professional exists and is active, the use case,
// the insert. A cancellation checks in the order: body shape, phone and code
// (a refusal is AppointmentNotFound, so a guess learns nothing), the booked
// appointment, the use case, the update. Both read, decide and write with no
// await between, so no other request of the process interleaves.
export function appointmentsRoute(db: DatabaseSync) {
	return new Hono()
		.get("/professionals/:id/slots", (c) => {
			const read = slotsOf(db, c, idOf(c.req.param("id")), new Date());
			if (!read.ok) return read.error;
			const { input } = read.value;
			return c.json({ timeZone: input.timeZone, slots: freeSlots(input) });
		})
		.post("/appointments", async (c) => {
			const body: unknown = await c.req.json().catch(() => undefined);
			if (!isBookingBody(body)) {
				return c.json({ error: { code: "BadRequest" } }, 400);
			}
			const read = slotsOf(db, c, body.professionalId, new Date());
			if (!read.ok) return read.error;
			const { professional, input } = read.value;
			const booking = book(body, input);
			if (!booking.ok) {
				const code = booking.error;
				return c.json({ error: { code } }, refusalStatus[code]);
			}
			const bookingCode = drawBookingCode();
			const inserted = insertAppointment(db, {
				professionalId: professional.id,
				bookingCode,
				...booking.value,
			});
			if (!inserted.ok) {
				const code = inserted.error.code;
				if (code === "SlotTaken") return c.json({ error: { code } }, 409);
				return databaseFailed(c);
			}
			return c.json(
				{
					bookingCode,
					startsAt: booking.value.startsAt,
					clientPhone: booking.value.clientPhone,
					professional,
				},
				201,
			);
		})
		.post("/appointments/cancel", async (c) => {
			const body: unknown = await c.req.json().catch(() => undefined);
			if (!isCancelBody(body)) {
				return c.json({ error: { code: "BadRequest" } }, 400);
			}
			const phone = checkClientPhone(body.clientPhone);
			const code = normalizeBookingCode(body.bookingCode);
			if (!phone.ok || !code.ok) return appointmentNotFound(c);
			const found = findBookedAppointment(db, code.value, phone.value);
			if (!found.ok) return databaseFailed(c);
			const appointment = found.value;
			if (!appointment) return appointmentNotFound(c);
			const clinic = findClinic(db);
			if (!clinic.ok) return databaseFailed(c);
			// An appointment exists only once the clinic is set up; kept for the types.
			if (!clinic.value) {
				return c.json({ error: { code: "ClinicNotSetUp" } }, 500);
			}
			const cancelled = cancel(appointment.startsAt, new Date());
			if (!cancelled.ok) {
				return c.json({ error: { code: cancelled.error } }, 409);
			}
			const updated = cancelAppointment(db, appointment.id);
			if (!updated.ok) return databaseFailed(c);
			if (!updated.value) return appointmentNotFound(c);
			return c.json({
				startsAt: appointment.startsAt,
				timeZone: clinic.value.timeZone,
				professional: appointment.professional,
			});
		});
}
