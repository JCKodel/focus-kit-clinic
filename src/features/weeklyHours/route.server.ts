import type { DatabaseSync } from "node:sqlite";
import { type Context, Hono } from "hono";
import { idOf } from "../../lib/id.ts";
import { err, ok, type Result } from "../../lib/result.ts";
import { requireSession } from "../../server/session.server.ts";
import { findClinic } from "../clinic/repository.server.ts";
import { findActiveProfessionals } from "../professionals/repository.server.ts";
import {
	findWorkingPeriods,
	replaceWorkingPeriods,
} from "./repository.server.ts";
import {
	isWorkingPeriod,
	setWeeklyHours,
	type WorkingPeriod,
} from "./rules.ts";

type HoursBody = { periods: WorkingPeriod[] };

function isHoursBody(body: unknown): body is HoursBody {
	if (typeof body !== "object" || body === null || !("periods" in body)) {
		return false;
	}
	return Array.isArray(body.periods) && body.periods.every(isWorkingPeriod);
}

function databaseFailed(c: Context) {
	return c.json({ error: { code: "DatabaseFailed" } }, 500);
}

function notFound(c: Context) {
	return c.json({ error: { code: "ProfessionalNotFound" } }, 404);
}

// What both routes check after the session and the body: the professional
// exists and is active, and the clinic's appointment length; else the answer.
function professionalAndSlot(
	db: DatabaseSync,
	c: Context,
): Result<{ id: number; slotMinutes: number }, Response> {
	const id = idOf(c.req.param("id") ?? "");
	if (id === undefined) return err(notFound(c));
	const active = findActiveProfessionals(db);
	if (!active.ok) return err(databaseFailed(c));
	if (!active.value.some((professional) => professional.id === id)) {
		return err(notFound(c));
	}
	const clinic = findClinic(db);
	if (!clinic.ok) return err(databaseFailed(c));
	// A session exists only once the clinic is set up; kept for the types.
	if (!clinic.value) {
		return err(c.json({ error: { code: "ClinicNotSetUp" } }, 500));
	}
	return ok({ id, slotMinutes: clinic.value.slotMinutes });
}

// The owner reads and replaces a professional's weekly hours. Checks run in
// the order: session, body shape, professional exists, the rule.
export function weeklyHoursRoute(db: DatabaseSync) {
	return new Hono()
		.get("/owner/professionals/:id/hours", requireSession(db), (c) => {
			const found = professionalAndSlot(db, c);
			if (!found.ok) return found.error;
			const { id, slotMinutes } = found.value;
			const periods = findWorkingPeriods(db, id);
			if (!periods.ok) return databaseFailed(c);
			return c.json({ slotMinutes, periods: periods.value });
		})
		.put("/owner/professionals/:id/hours", requireSession(db), async (c) => {
			const body: unknown = await c.req.json().catch(() => undefined);
			if (!isHoursBody(body)) {
				return c.json({ error: { code: "BadRequest" } }, 400);
			}
			const found = professionalAndSlot(db, c);
			if (!found.ok) return found.error;
			const { id, slotMinutes } = found.value;
			const periods = body.periods.map(({ weekday, start, end }) => ({
				weekday,
				start,
				end,
			}));
			const week = setWeeklyHours(periods, slotMinutes);
			if (!week.ok) return c.json({ error: { code: week.error.code } }, 400);
			const saved = replaceWorkingPeriods(db, id, week.value);
			if (!saved.ok) return databaseFailed(c);
			return c.json({ slotMinutes, periods: week.value });
		});
}
