import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { healthRoute } from "../features/health/route.server.ts";
import { openDatabase } from "./database.server.ts";
import { migrate } from "./migrate.server.ts";

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? "data/clinic.sqlite";
const migrations = fileURLToPath(new URL("./migrations/", import.meta.url));

const opened = openDatabase(databasePath);
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

const app = new Hono().route("/api", healthRoute);

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Server listening on http://localhost:${info.port}`);
});
