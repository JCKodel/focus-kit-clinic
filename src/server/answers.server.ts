import type { Context } from "hono";

// The error answers more than one route writes. A refusal only one route
// writes stays in that route.
export function badRequest(c: Context) {
	return c.json({ error: { code: "BadRequest" } }, 400);
}

export function notSignedIn(c: Context) {
	return c.json({ error: { code: "NotSignedIn" } }, 401);
}

export function professionalNotFound(c: Context) {
	return c.json({ error: { code: "ProfessionalNotFound" } }, 404);
}

// A route that found a professional, a session or an appointment, which
// exist only once the clinic is set up. GET /api/clinic answers 404 instead.
export function clinicNotSetUp(c: Context) {
	return c.json({ error: { code: "ClinicNotSetUp" } }, 500);
}

export function databaseFailed(c: Context) {
	return c.json({ error: { code: "DatabaseFailed" } }, 500);
}
