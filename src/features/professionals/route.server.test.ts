import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashToken, saveSession } from "../../server/session.server.ts";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { insertProfessional, setRemovedAt } from "./repository.server.ts";
import { professionalsRoute } from "./route.server.ts";

const token = "live-token";

let db: DatabaseSync;
let app: Hono;

beforeEach(() => {
	db = memoryDatabase();
	app = new Hono().route("/api", professionalsRoute(db));
	saveSession(db, {
		tokenHash: hashToken(token),
		createdAt: "2026-01-01T00:00:00.000Z",
		expiresAt: "2999-01-01T00:00:00.000Z",
	});
});

afterEach(() => {
	db.close();
});

type Call = {
	method: string;
	path: string;
	body?: unknown;
	signedIn?: boolean;
};

function call({ method, path, body, signedIn = true }: Call) {
	const headers: Record<string, string> = {};
	if (signedIn) headers.Cookie = `session=${token}`;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	return app.request(`/api${path}`, {
		method,
		headers,
		body:
			body === undefined
				? undefined
				: typeof body === "string"
					? body
					: JSON.stringify(body),
	});
}

function rows() {
	return db
		.prepare("SELECT id, name, removed_at FROM professional ORDER BY id")
		.all();
}

async function expectError(response: Response, status: number, code: string) {
	expect(response.status).toBe(status);
	expect(await response.json()).toEqual({ error: { code } });
}

describe("GET /api/professionals", () => {
	it("answers an empty list when there is none", async () => {
		const response = await call({
			method: "GET",
			path: "/professionals",
			signedIn: false,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ professionals: [] });
	});

	it("answers without a session, active only, by name ignoring case", async () => {
		insertProfessional(db, "rui Lopes");
		insertProfessional(db, "Ana Costa");
		insertProfessional(db, "Bruno Dias");
		insertProfessional(db, "ana costa");
		setRemovedAt(db, 3, "2026-09-28T10:15:00.000Z");

		const response = await call({
			method: "GET",
			path: "/professionals",
			signedIn: false,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			professionals: [
				{ id: 2, name: "Ana Costa" },
				{ id: 4, name: "ana costa" },
				{ id: 1, name: "rui Lopes" },
			],
		});
	});
});

describe("POST /api/owner/professionals", () => {
	const add = (body: unknown, signedIn = true) =>
		call({ method: "POST", path: "/owner/professionals", body, signedIn });

	it("answers 201 with the new professional, its name trimmed", async () => {
		insertProfessional(db, "Ana Costa");

		const response = await add({ name: "  Rui Lopes " });

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ id: 2, name: "Rui Lopes" });
		expect(rows()).toContainEqual({
			id: 2,
			name: "Rui Lopes",
			removed_at: null,
		});
	});

	it("answers 400 InvalidProfessionalName and adds nothing", async () => {
		for (const name of ["", "   ", "a".repeat(81)]) {
			await expectError(await add({ name }), 400, "InvalidProfessionalName");
		}
		expect(rows()).toEqual([]);
	});

	it("answers 409 ProfessionalNameTaken in any case and with spaces", async () => {
		insertProfessional(db, "Ana Costa");

		await expectError(
			await add({ name: " ANA costa " }),
			409,
			"ProfessionalNameTaken",
		);
		expect(rows()).toHaveLength(1);
	});

	it("adds the name of a removed professional as a new one", async () => {
		insertProfessional(db, "Ana Costa");
		setRemovedAt(db, 1, "2026-09-28T10:15:00.000Z");

		const response = await add({ name: "Ana Costa" });

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ id: 2, name: "Ana Costa" });
	});

	it("answers 400 BadRequest to a body of the wrong shape", async () => {
		for (const body of ["not json", {}, { name: 1 }, []]) {
			await expectError(await add(body), 400, "BadRequest");
		}
		expect(rows()).toEqual([]);
	});

	it("answers 401 NotSignedIn before looking at the body, adding nothing", async () => {
		await expectError(await add({ name: "Rui" }, false), 401, "NotSignedIn");
		await expectError(await add("not json", false), 401, "NotSignedIn");
		expect(rows()).toEqual([]);
	});
});

describe("PATCH /api/owner/professionals/:id", () => {
	const rename = (id: string, body: unknown, signedIn = true) =>
		call({
			method: "PATCH",
			path: `/owner/professionals/${id}`,
			body,
			signedIn,
		});

	beforeEach(() => {
		insertProfessional(db, "Ana Costa");
		insertProfessional(db, "Rui Lopes");
	});

	it("answers 200 with the new name, trimmed", async () => {
		const response = await rename("2", { name: " Rui M. Lopes " });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: 2, name: "Rui M. Lopes" });
		expect(rows()[1]).toEqual({
			id: 2,
			name: "Rui M. Lopes",
			removed_at: null,
		});
	});

	it("accepts the professional's own name in another case", async () => {
		const response = await rename("1", { name: "ANA COSTA" });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: 1, name: "ANA COSTA" });
	});

	it("answers 400 InvalidProfessionalName and changes nothing", async () => {
		await expectError(
			await rename("2", { name: " " }),
			400,
			"InvalidProfessionalName",
		);
		expect(rows()[1]).toMatchObject({ name: "Rui Lopes" });
	});

	it("answers 409 ProfessionalNameTaken and changes nothing", async () => {
		await expectError(
			await rename("2", { name: "ana costa" }),
			409,
			"ProfessionalNameTaken",
		);
		expect(rows()[1]).toMatchObject({ name: "Rui Lopes" });
	});

	it("answers 404 ProfessionalNotFound to an unknown or removed one", async () => {
		setRemovedAt(db, 2, "2026-09-28T10:15:00.000Z");

		await expectError(
			await rename("9", { name: "X" }),
			404,
			"ProfessionalNotFound",
		);
		await expectError(
			await rename("2", { name: "X" }),
			404,
			"ProfessionalNotFound",
		);
		expect(rows()[1]).toMatchObject({ name: "Rui Lopes" });
	});

	it("answers 404 to an id that is not a positive whole number", async () => {
		for (const id of ["abc", "0", "-1", "1.5", "01", "1e3"]) {
			await expectError(
				await rename(id, { name: "X" }),
				404,
				"ProfessionalNotFound",
			);
		}
	});

	it("checks not found before the name", async () => {
		await expectError(
			await rename("9", { name: "" }),
			404,
			"ProfessionalNotFound",
		);
	});

	it("checks the body before not found", async () => {
		await expectError(await rename("9", { name: 1 }), 400, "BadRequest");
		await expectError(await rename("abc", "not json"), 400, "BadRequest");
	});

	it("answers 401 NotSignedIn before anything else, changing nothing", async () => {
		await expectError(
			await rename("2", { name: "Other" }, false),
			401,
			"NotSignedIn",
		);
		await expectError(
			await rename("abc", "not json", false),
			401,
			"NotSignedIn",
		);
		expect(rows()[1]).toMatchObject({ name: "Rui Lopes" });
	});
});

describe("DELETE /api/owner/professionals/:id", () => {
	const remove = (id: string, signedIn = true) =>
		call({ method: "DELETE", path: `/owner/professionals/${id}`, signedIn });

	beforeEach(() => {
		insertProfessional(db, "Ana Costa");
	});

	it("answers 204 and keeps the row with its removal instant", async () => {
		const before = Date.now();

		const response = await remove("1");

		expect(response.status).toBe(204);
		const [row] = rows();
		expect(row).toMatchObject({ id: 1, name: "Ana Costa" });
		const removedAt = Date.parse(String(row.removed_at));
		expect(removedAt).toBeGreaterThanOrEqual(before - 1);
		expect(removedAt).toBeLessThanOrEqual(Date.now());
		expect(String(row.removed_at)).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
		const list = await call({ method: "GET", path: "/professionals" });
		expect(await list.json()).toEqual({ professionals: [] });
	});

	it("answers 404 ProfessionalNotFound when removed again, keeping the instant", async () => {
		await remove("1");
		const [first] = rows();

		await expectError(await remove("1"), 404, "ProfessionalNotFound");
		expect(rows()).toEqual([first]);
	});

	it("answers 404 to an unknown id and to one that is not a whole number", async () => {
		for (const id of ["9", "abc", "0"]) {
			await expectError(await remove(id), 404, "ProfessionalNotFound");
		}
	});

	it("answers 401 NotSignedIn and changes nothing", async () => {
		await expectError(await remove("1", false), 401, "NotSignedIn");
		expect(rows()).toEqual([{ id: 1, name: "Ana Costa", removed_at: null }]);
	});
});
