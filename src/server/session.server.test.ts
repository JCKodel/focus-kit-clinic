import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
	deleteSession,
	findSession,
	hashToken,
	newSessionToken,
	saveSession,
} from "./session.server.ts";
import { memoryDatabase } from "./testDatabase.server.ts";

let db: DatabaseSync;

beforeEach(() => {
	db = memoryDatabase();
});

afterEach(() => {
	db.close();
});

it("makes a 32 byte base64url token and hashes it to lower-case hex", () => {
	const token = newSessionToken();

	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
	expect(newSessionToken()).not.toBe(token);
});

it("finds a session by its token hash and deletes it", () => {
	const session = {
		tokenHash: hashToken("token"),
		createdAt: "2026-09-28T10:00:00.000Z",
		expiresAt: "2026-10-28T10:00:00.000Z",
	};
	saveSession(db, session);

	expect(findSession(db, session.tokenHash)).toEqual({
		ok: true,
		value: session,
	});
	expect(findSession(db, hashToken("other"))).toEqual({
		ok: true,
		value: undefined,
	});

	expect(deleteSession(db, session.tokenHash)).toEqual({
		ok: true,
		value: undefined,
	});
	expect(findSession(db, session.tokenHash)).toEqual({
		ok: true,
		value: undefined,
	});
});
