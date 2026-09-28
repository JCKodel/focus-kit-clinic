import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { isSessionLive, sessionDays } from "../features/signIn/rules.ts";
import type { Result } from "../lib/result.ts";
import { type DatabaseFailed, query } from "./database.server.ts";

export type SessionRow = {
	tokenHash: string;
	createdAt: string;
	expiresAt: string;
};

const cookieName = "session";
const cookieAttributes = "HttpOnly; SameSite=Lax; Path=/";

// 32 random bytes, sent only in the cookie; the database keeps its SHA-256.
export function newSessionToken(): string {
	return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function setSessionCookie(c: Context, token: string): void {
	const maxAge = sessionDays * 24 * 60 * 60;
	c.header(
		"Set-Cookie",
		`${cookieName}=${token}; ${cookieAttributes}; Max-Age=${maxAge}`,
	);
}

export function clearSessionCookie(c: Context): void {
	c.header("Set-Cookie", `${cookieName}=; ${cookieAttributes}; Max-Age=0`);
}

export function readSessionToken(c: Context): string | undefined {
	return getCookie(c, cookieName) || undefined;
}

export function saveSession(
	db: DatabaseSync,
	session: SessionRow,
): Result<void, DatabaseFailed> {
	return query(() => {
		db.prepare(
			"INSERT INTO session (token_hash, created_at, expires_at) VALUES (?, ?, ?)",
		).run(session.tokenHash, session.createdAt, session.expiresAt);
	});
}

export function findSession(
	db: DatabaseSync,
	tokenHash: string,
): Result<SessionRow | undefined, DatabaseFailed> {
	return query(() => {
		const row = db
			.prepare(
				"SELECT token_hash, created_at, expires_at FROM session WHERE token_hash = ?",
			)
			.get(tokenHash);
		if (!row) return undefined;
		return {
			tokenHash: String(row.token_hash),
			createdAt: String(row.created_at),
			expiresAt: String(row.expires_at),
		};
	});
}

export function deleteSession(
	db: DatabaseSync,
	tokenHash: string,
): Result<void, DatabaseFailed> {
	return query(() => {
		db.prepare("DELETE FROM session WHERE token_hash = ?").run(tokenHash);
	});
}

// The owner route check: a live session is required, else 401 NotSignedIn.
// An expired row is deleted when met. First use: GET /api/owner/session;
// second use: the owner routes of professionals.
export function requireSession(db: DatabaseSync): MiddlewareHandler {
	return async (c, next) => {
		const token = readSessionToken(c);
		if (!token) return notSignedIn(c);
		const tokenHash = hashToken(token);
		const found = findSession(db, tokenHash);
		if (!found.ok) return databaseFailed(c);
		if (!found.value) return notSignedIn(c);
		if (!isSessionLive(found.value.expiresAt, new Date())) {
			const deleted = deleteSession(db, tokenHash);
			if (!deleted.ok) return databaseFailed(c);
			return notSignedIn(c);
		}
		await next();
	};
}

function notSignedIn(c: Context) {
	return c.json({ error: { code: "NotSignedIn" } }, 401);
}

function databaseFailed(c: Context) {
	return c.json({ error: { code: "DatabaseFailed" } }, 500);
}
