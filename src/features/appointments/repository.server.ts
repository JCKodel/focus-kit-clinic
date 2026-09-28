import type { DatabaseSync } from "node:sqlite";
import { err, type Result } from "../../lib/result.ts";
import { type DatabaseFailed, query } from "../../server/database.server.ts";
import type { Professional } from "../professionals/rules.ts";

export type NewAppointment = {
	professionalId: number;
	startsAt: string;
	clientName: string;
	clientPhone: string;
	bookingCode: string;
};

export type InsertError = { code: "SlotTaken" } | DatabaseFailed;

// The starts of the professional's booked appointments at or after `from`,
// ascending: toISOString() text sorts as time.
export function findBookedStarts(
	db: DatabaseSync,
	professionalId: number,
	from: string,
): Result<string[], DatabaseFailed> {
	return query(() =>
		db
			.prepare(
				"SELECT starts_at FROM appointment WHERE professional_id = ? AND status = 'booked' AND starts_at >= ? ORDER BY starts_at",
			)
			.all(professionalId, from)
			.map((row) => String(row.starts_at)),
	);
}

// The index appointment_booked_slot is the last guard against a double
// booking (docs/02): its failure is SlotTaken. Any other, a repeated booking
// code included, is DatabaseFailed.
export function insertAppointment(
	db: DatabaseSync,
	appointment: NewAppointment,
): Result<void, InsertError> {
	const inserted = query(() => {
		db.prepare(
			"INSERT INTO appointment (professional_id, starts_at, client_name, client_phone, booking_code) VALUES (?, ?, ?, ?, ?)",
		).run(
			appointment.professionalId,
			appointment.startsAt,
			appointment.clientName,
			appointment.clientPhone,
			appointment.bookingCode,
		);
	});
	if (
		!inserted.ok &&
		inserted.error.message.includes(
			"UNIQUE constraint failed: appointment.professional_id, appointment.starts_at",
		)
	) {
		return err({ code: "SlotTaken" });
	}
	return inserted;
}

export type BookedAppointment = {
	id: number;
	startsAt: string;
	professional: Professional;
};

// The booked appointment with this code and these phone digits, with its
// professional, removed or not; undefined when none.
export function findBookedAppointment(
	db: DatabaseSync,
	bookingCode: string,
	clientPhone: string,
): Result<BookedAppointment | undefined, DatabaseFailed> {
	return query(() => {
		const row = db
			.prepare(
				"SELECT appointment.id, appointment.starts_at, professional.id AS professional_id, professional.name FROM appointment JOIN professional ON professional.id = appointment.professional_id WHERE appointment.status = 'booked' AND appointment.booking_code = ? AND appointment.client_phone = ?",
			)
			.get(bookingCode, clientPhone);
		if (row === undefined) return undefined;
		return {
			id: Number(row.id),
			startsAt: String(row.starts_at),
			professional: { id: Number(row.professional_id), name: String(row.name) },
		};
	});
}

// Keeps the row with status cancelled. True when this call changed it; false
// when it was no longer booked, so of two racing cancellations one is true.
export function cancelAppointment(
	db: DatabaseSync,
	id: number,
): Result<boolean, DatabaseFailed> {
	return query(
		() =>
			db
				.prepare(
					"UPDATE appointment SET status = 'cancelled' WHERE id = ? AND status = 'booked'",
				)
				.run(id).changes === 1,
	);
}
