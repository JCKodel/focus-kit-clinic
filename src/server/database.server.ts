import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "../lib/result.ts";

export type DatabaseOpenFailed = {
	code: "DatabaseOpenFailed";
	path: string;
	message: string;
};

// Opens the SQLite file, creating its folder and the file when missing.
export function openDatabase(
	path: string,
): Result<DatabaseSync, DatabaseOpenFailed> {
	try {
		mkdirSync(dirname(path), { recursive: true });
		return ok(new DatabaseSync(path));
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
