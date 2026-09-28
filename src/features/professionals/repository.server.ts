import type { DatabaseSync } from "node:sqlite";
import type { Result } from "../../lib/result.ts";
import { type DatabaseFailed, query } from "../../server/database.server.ts";
import type { Professional } from "./rules.ts";

// Active professionals only, in id order; the use case sorts by name.
export function findActiveProfessionals(
	db: DatabaseSync,
): Result<Professional[], DatabaseFailed> {
	return query(() =>
		db
			.prepare(
				"SELECT id, name FROM professional WHERE removed_at IS NULL ORDER BY id",
			)
			.all()
			.map((row) => ({ id: Number(row.id), name: String(row.name) })),
	);
}

export function insertProfessional(
	db: DatabaseSync,
	name: string,
): Result<Professional, DatabaseFailed> {
	return query(() => {
		const inserted = db
			.prepare("INSERT INTO professional (name) VALUES (?)")
			.run(name);
		return { id: Number(inserted.lastInsertRowid), name };
	});
}

export function updateProfessionalName(
	db: DatabaseSync,
	id: number,
	name: string,
): Result<void, DatabaseFailed> {
	return query(() => {
		db.prepare("UPDATE professional SET name = ? WHERE id = ?").run(name, id);
	});
}

// Removal keeps the row: only its removal instant is set.
export function setRemovedAt(
	db: DatabaseSync,
	id: number,
	removedAt: string,
): Result<void, DatabaseFailed> {
	return query(() => {
		db.prepare("UPDATE professional SET removed_at = ? WHERE id = ?").run(
			removedAt,
			id,
		);
	});
}
