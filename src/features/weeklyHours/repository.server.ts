import type { DatabaseSync } from "node:sqlite";
import type { Result } from "../../lib/result.ts";
import {
	type DatabaseFailed,
	query,
	transaction,
} from "../../server/database.server.ts";
import type { Weekday, WorkingPeriod } from "./rules.ts";

// Ordered by weekday then start: zero-padded times sort as text.
export function findWorkingPeriods(
	db: DatabaseSync,
	professionalId: number,
): Result<WorkingPeriod[], DatabaseFailed> {
	return query(() =>
		db
			.prepare(
				"SELECT weekday, start_time, end_time FROM working_period WHERE professional_id = ? ORDER BY weekday, start_time",
			)
			.all(professionalId)
			.map((row) => ({
				// the table's CHECK keeps it from 1 to 7
				weekday: Number(row.weekday) as Weekday,
				start: String(row.start_time),
				end: String(row.end_time),
			})),
	);
}

// The professional's whole week, in one transaction: the new rows, or the
// old ones untouched (docs/03, invariant 11).
export function replaceWorkingPeriods(
	db: DatabaseSync,
	professionalId: number,
	periods: WorkingPeriod[],
): Result<void, DatabaseFailed> {
	return transaction(db, () => {
		db.prepare("DELETE FROM working_period WHERE professional_id = ?").run(
			professionalId,
		);
		const insert = db.prepare(
			"INSERT INTO working_period (professional_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)",
		);
		for (const period of periods) {
			insert.run(professionalId, period.weekday, period.start, period.end);
		}
	});
}
