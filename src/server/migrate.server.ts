import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "../lib/result.ts";

export type MigrationFailed = {
	code: "MigrationFailed";
	file: string;
	message: string;
};

const migrationFile = /^\d{4}-.+\.sql$/;

// Applies, in file name order, every migration of the folder not yet recorded
// in schema_migration. Each file runs in its own transaction with its row.
// When the folder cannot be read or schema_migration cannot be created,
// `file` holds the folder, since no migration file was reached.
export function migrate(
	db: DatabaseSync,
	folder: string,
): Result<string[], MigrationFailed> {
	let pending: string[];
	try {
		db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
			name       TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`);
		const applied = new Set(
			db
				.prepare("SELECT name FROM schema_migration")
				.all()
				.map((row) => String(row.name)),
		);
		pending = readdirSync(folder)
			.filter((name) => migrationFile.test(name) && !applied.has(name))
			.sort();
	} catch (error) {
		return err({ code: "MigrationFailed", file: folder, message: text(error) });
	}

	const record = db.prepare(
		"INSERT INTO schema_migration (name, applied_at) VALUES (?, ?)",
	);
	for (const file of pending) {
		try {
			const sql = readFileSync(join(folder, file), "utf8");
			db.exec("BEGIN");
			db.exec(sql);
			record.run(file, new Date().toISOString());
			db.exec("COMMIT");
		} catch (error) {
			if (db.isTransaction) db.exec("ROLLBACK");
			return err({ code: "MigrationFailed", file, message: text(error) });
		}
	}
	return ok(pending);
}

function text(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
