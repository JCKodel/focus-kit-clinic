import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { normaliseEmail } from "../../lib/email.ts";
import {
	badRequest,
	databaseFailed,
	notSignedIn,
} from "../../server/answers.server.ts";
import { checkPassword, fixedHash } from "../../server/password.server.ts";
import {
	clearSessionCookie,
	deleteSession,
	hashToken,
	newSessionToken,
	readSessionToken,
	requireSession,
	saveSession,
	setSessionCookie,
} from "../../server/session.server.ts";
import { findOwner } from "./repository.server.ts";
import { sessionExpiry } from "./rules.ts";

type Options = { checkPassword?: typeof checkPassword };

type SignInBody = { email: string; password: string };

function isSignInBody(body: unknown): body is SignInBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"email" in body &&
		typeof body.email === "string" &&
		"password" in body &&
		typeof body.password === "string"
	);
}

// `checkPassword` is a parameter so a test can count its calls.
export function signInRoute(db: DatabaseSync, options: Options = {}) {
	const check = options.checkPassword ?? checkPassword;

	return new Hono()
		.post("/owner/sign-in", async (c) => {
			const body: unknown = await c.req.json().catch(() => undefined);
			if (!isSignInBody(body)) return badRequest(c);
			const found = findOwner(db);
			if (!found.ok) return databaseFailed(c);
			const owner = found.value;

			// Always one scrypt check, so a wrong email and a wrong password take
			// the same time.
			const isOwner =
				owner !== undefined && owner.email === normaliseEmail(body.email);
			const matches = await check(
				body.password,
				isOwner ? owner.passwordHash : fixedHash,
			);
			if (!isOwner || !matches) {
				return c.json({ error: { code: "SignInRefused" } }, 401);
			}

			const token = newSessionToken();
			const now = new Date();
			const saved = saveSession(db, {
				tokenHash: hashToken(token),
				createdAt: now.toISOString(),
				expiresAt: sessionExpiry(now),
			});
			if (!saved.ok) return databaseFailed(c);
			setSessionCookie(c, token);
			return c.json({ email: owner.email });
		})
		.post("/owner/sign-out", (c) => {
			const token = readSessionToken(c);
			if (token) {
				const deleted = deleteSession(db, hashToken(token));
				if (!deleted.ok) return databaseFailed(c);
			}
			clearSessionCookie(c);
			return c.body(null, 204);
		})
		.get("/owner/session", requireSession(db), (c) => {
			const owner = findOwner(db);
			if (!owner.ok) return databaseFailed(c);
			if (!owner.value) return notSignedIn(c);
			return c.json({ email: owner.value.email });
		});
}
