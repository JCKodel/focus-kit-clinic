import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkPassword,
	fixedHash,
	hashPassword,
} from "../../server/password.server.ts";
import { hashToken, saveSession } from "../../server/session.server.ts";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { saveClinicAndOwner } from "../clinic/repository.server.ts";
import { signInRoute } from "./route.server.ts";

const password = "correct horse battery";
const ownerHash = await hashPassword(password);

let db: DatabaseSync;
let app: Hono;

beforeEach(() => {
	db = memoryDatabase();
	app = new Hono().route("/api", signInRoute(db));
});

afterEach(() => {
	db.close();
});

function setUp() {
	saveClinicAndOwner(db, {
		name: "Clinica Sol",
		timeZone: "Europe/Lisbon",
		slotMinutes: 30,
		email: "owner@example.com",
		passwordHash: ownerHash,
	});
}

function signIn(body: unknown, target = app) {
	return target.request("/api/owner/sign-in", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

function tokenOf(response: Response): string {
	const match = /^session=([^;]+);/.exec(
		response.headers.get("Set-Cookie") ?? "",
	);
	return match ? match[1] : "";
}

function withCookie(token: string) {
	return { headers: { Cookie: `session=${token}` } };
}

function sessionCount(): number {
	return Number(db.prepare("SELECT count(*) AS n FROM session").get()?.n);
}

describe("POST /api/owner/sign-in", () => {
	it("answers the email and sets the cookie exactly", async () => {
		setUp();

		const response = await signIn({ email: "owner@example.com", password });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ email: "owner@example.com" });
		const token = tokenOf(response);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(response.headers.get("Set-Cookie")).toBe(
			`session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
		);
	});

	it("keeps only the SHA-256 of the token, with a 30 day expiry", async () => {
		setUp();

		const response = await signIn({ email: "owner@example.com", password });

		const token = tokenOf(response);
		const rows = db.prepare("SELECT * FROM session").all();
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row.token_hash).toBe(hashToken(token));
		const created = Date.parse(String(row.created_at));
		const expires = Date.parse(String(row.expires_at));
		expect(expires - created).toBe(30 * 24 * 60 * 60 * 1000);
	});

	it("matches the email in any case and with surrounding spaces", async () => {
		setUp();

		const response = await signIn({ email: "  OWNER@Example.com ", password });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ email: "owner@example.com" });
	});

	it("answers 401 SignInRefused to a wrong password", async () => {
		setUp();

		const response = await signIn({
			email: "owner@example.com",
			password: "wrong password!",
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { code: "SignInRefused" } });
		expect(response.headers.get("Set-Cookie")).toBeNull();
		expect(sessionCount()).toBe(0);
	});

	it("checks an unknown email once against the fixed hash and refuses", async () => {
		setUp();
		const check = vi.fn(checkPassword);
		const spied = new Hono().route(
			"/api",
			signInRoute(db, { checkPassword: check }),
		);

		const response = await signIn(
			{ email: "someone@example.com", password },
			spied,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { code: "SignInRefused" } });
		expect(check).toHaveBeenCalledTimes(1);
		expect(check).toHaveBeenCalledWith(password, fixedHash);
	});

	it("answers 401 SignInRefused before setup", async () => {
		const response = await signIn({ email: "owner@example.com", password });

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { code: "SignInRefused" } });
	});

	it("answers 400 BadRequest when the body is not the right shape", async () => {
		setUp();

		for (const body of [
			"not json",
			{ email: "owner@example.com" },
			{ email: 1, password },
			[],
		]) {
			const response = await signIn(body);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: { code: "BadRequest" } });
		}
	});
});

describe("GET /api/owner/session", () => {
	it("answers the email to a live session", async () => {
		setUp();
		const token = tokenOf(
			await signIn({ email: "owner@example.com", password }),
		);

		const response = await app.request("/api/owner/session", withCookie(token));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ email: "owner@example.com" });
	});

	it("answers 401 NotSignedIn without a cookie", async () => {
		const response = await app.request("/api/owner/session");

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { code: "NotSignedIn" } });
	});

	it("answers 401 NotSignedIn to an unknown token", async () => {
		setUp();

		const response = await app.request(
			"/api/owner/session",
			withCookie("unknown"),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { code: "NotSignedIn" } });
	});

	it("answers 401 NotSignedIn to an expired session and deletes its row", async () => {
		setUp();
		saveSession(db, {
			tokenHash: hashToken("expired"),
			createdAt: "2020-01-01T00:00:00.000Z",
			expiresAt: "2020-01-31T00:00:00.000Z",
		});

		const response = await app.request(
			"/api/owner/session",
			withCookie("expired"),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { code: "NotSignedIn" } });
		expect(sessionCount()).toBe(0);
	});
});

describe("POST /api/owner/sign-out", () => {
	it("answers 204, deletes the session and clears the cookie exactly", async () => {
		setUp();
		const token = tokenOf(
			await signIn({ email: "owner@example.com", password }),
		);

		const response = await app.request("/api/owner/sign-out", {
			method: "POST",
			...withCookie(token),
		});

		expect(response.status).toBe(204);
		expect(response.headers.get("Set-Cookie")).toBe(
			"session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
		);
		expect(sessionCount()).toBe(0);
		const after = await app.request("/api/owner/session", withCookie(token));
		expect(after.status).toBe(401);
	});

	it("answers 204 without a session", async () => {
		const response = await app.request("/api/owner/sign-out", {
			method: "POST",
		});

		expect(response.status).toBe(204);
		expect(response.headers.get("Set-Cookie")).toBe(
			"session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
		);
	});
});
