import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { databaseFailed } from "../../server/answers.server.ts";
import { findClinic } from "./repository.server.ts";

export function clinicRoute(db: DatabaseSync) {
	return new Hono().get("/clinic", (c) => {
		const clinic = findClinic(db);
		if (!clinic.ok) return databaseFailed(c);
		if (!clinic.value)
			return c.json({ error: { code: "ClinicNotSetUp" } }, 404);
		return c.json(clinic.value);
	});
}
