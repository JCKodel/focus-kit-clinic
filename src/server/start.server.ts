import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./database.server.ts";
import { migrate } from "./migrate.server.ts";

const migrations = fileURLToPath(new URL("./migrations/", import.meta.url));

// Opens the database at DATABASE_PATH and applies pending migrations, or
// stops the process with exit code 1. First use: the server start; second
// use: the setup command.
export function openMigratedDatabase(): DatabaseSync {
	const path = process.env.DATABASE_PATH ?? "data/clinic.sqlite";
	const opened = openDatabase(path);
	if (!opened.ok) {
		console.error(
			`Cannot open the database ${opened.error.path}: ${opened.error.message}`,
		);
		process.exit(1);
	}

	const migrated = migrate(opened.value, migrations);
	if (!migrated.ok) {
		console.error(
			`Migration ${migrated.error.file} failed: ${migrated.error.message}`,
		);
		process.exit(1);
	}
	for (const file of migrated.value) console.log(`Applied migration ${file}`);
	return opened.value;
}
