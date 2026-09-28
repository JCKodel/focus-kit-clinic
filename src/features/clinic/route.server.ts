import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { findClinic } from "./repository.server.ts";

export function clinicRoute(db: DatabaseSync) {
	return new Hono().get("/clinic", (c) => {
		const clinic = findClinic(db);
		if (!clinic.ok) return c.json({ error: { code: "DatabaseFailed" } }, 500);
		if (!clinic.value)
			return c.json({ error: { code: "ClinicNotSetUp" } }, 404);
		return c.json(clinic.value);
	});
}
