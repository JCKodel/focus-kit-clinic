import type { DatabaseSync } from "node:sqlite";
import type { Result } from "../../lib/result.ts";
import { type DatabaseFailed, query } from "../../server/database.server.ts";

export type Owner = { email: string; passwordHash: string };

export function findOwner(
	db: DatabaseSync,
): Result<Owner | undefined, DatabaseFailed> {
	return query(() => {
		const row = db
			.prepare("SELECT email, password_hash FROM owner WHERE id = 1")
			.get();
		if (!row) return undefined;
		return {
			email: String(row.email),
			passwordHash: String(row.password_hash),
		};
	});
}
