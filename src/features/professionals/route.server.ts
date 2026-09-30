import type { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { idOf } from "../../lib/id.ts";
import { badRequest, databaseFailed } from "../../server/answers.server.ts";
import { requireSession } from "../../server/session.server.ts";
import {
	findActiveProfessionals,
	insertProfessional,
	setRemovedAt,
	updateProfessionalName,
} from "./repository.server.ts";
import {
	addProfessional,
	removeProfessional,
	renameProfessional,
	sortByName,
} from "./rules.ts";

type NameBody = { name: string };

function isNameBody(body: unknown): body is NameBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"name" in body &&
		typeof body.name === "string"
	);
}

const refusalStatus = {
	InvalidProfessionalName: 400,
	ProfessionalNameTaken: 409,
	ProfessionalNotFound: 404,
} as const;

function refused(c: Context, code: keyof typeof refusalStatus) {
	return c.json({ error: { code } }, refusalStatus[code]);
}

// The public list and the owner's add, rename and remove. Checks run in the
// order: session, body shape, professional exists, name.
export function professionalsRoute(db: DatabaseSync) {
	return new Hono()
		.get("/professionals", (c) => {
			const active = findActiveProfessionals(db);
			if (!active.ok) return databaseFailed(c);
			return c.json({ professionals: sortByName(active.value) });
		})
		.post("/owner/professionals", requireSession(db), async (c) => {
			const body: unknown = await c.req.json().catch(() => undefined);
			if (!isNameBody(body)) return badRequest(c);
			const active = findActiveProfessionals(db);
			if (!active.ok) return databaseFailed(c);
			const name = addProfessional(body.name, active.value);
			if (!name.ok) return refused(c, name.error);
			const inserted = insertProfessional(db, name.value);
			if (!inserted.ok) return databaseFailed(c);
			return c.json(inserted.value, 201);
		})
		.patch("/owner/professionals/:id", requireSession(db), async (c) => {
			const body: unknown = await c.req.json().catch(() => undefined);
			if (!isNameBody(body)) return badRequest(c);
			const id = idOf(c.req.param("id"));
			if (id === undefined) return refused(c, "ProfessionalNotFound");
			const active = findActiveProfessionals(db);
			if (!active.ok) return databaseFailed(c);
			const name = renameProfessional(id, body.name, active.value);
			if (!name.ok) return refused(c, name.error);
			const updated = updateProfessionalName(db, id, name.value);
			if (!updated.ok) return databaseFailed(c);
			return c.json({ id, name: name.value });
		})
		.delete("/owner/professionals/:id", requireSession(db), (c) => {
			const id = idOf(c.req.param("id"));
			if (id === undefined) return refused(c, "ProfessionalNotFound");
			const active = findActiveProfessionals(db);
			if (!active.ok) return databaseFailed(c);
			const removedAt = removeProfessional(id, active.value, new Date());
			if (!removedAt.ok) return refused(c, removedAt.error);
			const removed = setRemovedAt(db, id, removedAt.value);
			if (!removed.ok) return databaseFailed(c);
			return c.body(null, 204);
		});
}
