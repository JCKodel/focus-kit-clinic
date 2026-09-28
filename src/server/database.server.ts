import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "../lib/result.ts";

export type DatabaseOpenFailed = {
	code: "DatabaseOpenFailed";
	path: string;
	message: string;
};

// How long a connection waits for a lock held by another connection on the
// same file before failing with SQLITE_BUSY.
export const busyTimeoutMs = 5000;

// Opens the SQLite file, creating its folder and the file when missing.
export function openDatabase(
	path: string,
): Result<DatabaseSync, DatabaseOpenFailed> {
	try {
		mkdirSync(dirname(path), { recursive: true });
		return ok(new DatabaseSync(path, { timeout: busyTimeoutMs }));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err({ code: "DatabaseOpenFailed", path, message });
	}
}

export type DatabaseFailed = { code: "DatabaseFailed"; message: string };

// Where a repository's SQLite exception becomes a Result. First use: the
// clinic repository; second use: the session queries.
export function query<T>(run: () => T): Result<T, DatabaseFailed> {
	try {
		return ok(run());
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return err({ code: "DatabaseFailed", message });
	}
}

// A query whose statements are written together or not at all. First use:
// saveClinicAndOwner; second use: replaceWorkingPeriods. IMMEDIATE takes the
// write lock at the start, where the busy timeout applies: a deferred BEGIN
// that reads first and writes later fails at once, without waiting.
export function transaction<T>(
	db: DatabaseSync,
	run: () => T,
): Result<T, DatabaseFailed> {
	const done = query(() => {
		db.exec("BEGIN IMMEDIATE");
		const value = run();
		db.exec("COMMIT");
		return value;
	});
	if (!done.ok && db.isTransaction) db.exec("ROLLBACK");
	return done;
}
