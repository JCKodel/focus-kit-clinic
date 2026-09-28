import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, expect, it } from "vitest";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { saveClinicAndOwner } from "./repository.server.ts";
import { clinicRoute } from "./route.server.ts";

let db: DatabaseSync;
let app: Hono;

beforeEach(() => {
	db = memoryDatabase();
	app = new Hono().route("/api", clinicRoute(db));
});

afterEach(() => {
	db.close();
});

it("answers 404 ClinicNotSetUp before setup", async () => {
	const response = await app.request("/api/clinic");

	expect(response.status).toBe(404);
	expect(await response.json()).toEqual({ error: { code: "ClinicNotSetUp" } });
});

it("answers the clinic after setup", async () => {
	saveClinicAndOwner(db, {
		name: "Clinica Sol",
		timeZone: "Europe/Lisbon",
		slotMinutes: 30,
		email: "owner@example.com",
		passwordHash: "scrypt$16384$8$1$salt$key",
	});

	const response = await app.request("/api/clinic");

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		name: "Clinica Sol",
		timeZone: "Europe/Lisbon",
		slotMinutes: 30,
	});
});
