import type { DatabaseSync } from "node:sqlite";
import type { Result } from "../../lib/result.ts";
import {
	type DatabaseFailed,
	query,
	transaction,
} from "../../server/database.server.ts";

export type Clinic = { name: string; timeZone: string; slotMinutes: number };

export type ClinicAndOwner = Clinic & { email: string; passwordHash: string };

export function findClinic(
	db: DatabaseSync,
): Result<Clinic | undefined, DatabaseFailed> {
	return query(() => {
		const row = db
			.prepare("SELECT name, time_zone, slot_minutes FROM clinic WHERE id = 1")
			.get();
		if (!row) return undefined;
		return {
			name: String(row.name),
			timeZone: String(row.time_zone),
			slotMinutes: Number(row.slot_minutes),
		};
	});
}

// Writes the clinic and the owner in one transaction: both or neither.
export function saveClinicAndOwner(
	db: DatabaseSync,
	setup: ClinicAndOwner,
): Result<void, DatabaseFailed> {
	return transaction(db, () => {
		db.prepare(
			"INSERT INTO clinic (id, name, time_zone, slot_minutes) VALUES (1, ?, ?, ?)",
		).run(setup.name, setup.timeZone, setup.slotMinutes);
		db.prepare(
			"INSERT INTO owner (id, email, password_hash) VALUES (1, ?, ?)",
		).run(setup.email, setup.passwordHash);
	});
}
