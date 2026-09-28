import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import {
	findActiveProfessionals,
	insertProfessional,
	setRemovedAt,
	updateProfessionalName,
} from "./repository.server.ts";

let db: DatabaseSync;

beforeEach(() => {
	db = memoryDatabase();
});

afterEach(() => {
	db.close();
});

function rows() {
	return db.prepare("SELECT id, name, removed_at FROM professional").all();
}

it("finds no professional at first", () => {
	expect(findActiveProfessionals(db)).toEqual({ ok: true, value: [] });
});

it("inserts a professional and answers its id", () => {
	expect(insertProfessional(db, "Ana Costa")).toEqual({
		ok: true,
		value: { id: 1, name: "Ana Costa" },
	});
	expect(insertProfessional(db, "Rui Lopes")).toEqual({
		ok: true,
		value: { id: 2, name: "Rui Lopes" },
	});

	expect(rows()).toEqual([
		{ id: 1, name: "Ana Costa", removed_at: null },
		{ id: 2, name: "Rui Lopes", removed_at: null },
	]);
});

it("renames a professional", () => {
	insertProfessional(db, "Rui Lopes");

	expect(updateProfessionalName(db, 1, "Rui M. Lopes")).toEqual({
		ok: true,
		value: undefined,
	});

	expect(findActiveProfessionals(db)).toEqual({
		ok: true,
		value: [{ id: 1, name: "Rui M. Lopes" }],
	});
});

it("sets the removal instant and keeps the row", () => {
	insertProfessional(db, "Ana Costa");

	expect(setRemovedAt(db, 1, "2026-09-28T10:15:00.000Z")).toEqual({
		ok: true,
		value: undefined,
	});

	expect(rows()).toEqual([
		{ id: 1, name: "Ana Costa", removed_at: "2026-09-28T10:15:00.000Z" },
	]);
});

it("lists active professionals only", () => {
	insertProfessional(db, "Ana Costa");
	insertProfessional(db, "Rui Lopes");
	insertProfessional(db, "Ana Costa");
	setRemovedAt(db, 1, "2026-09-28T10:15:00.000Z");

	expect(findActiveProfessionals(db)).toEqual({
		ok: true,
		value: [
			{ id: 2, name: "Rui Lopes" },
			{ id: 3, name: "Ana Costa" },
		],
	});
});

it("answers DatabaseFailed when the table is missing", () => {
	db.exec("DROP TABLE professional");

	const found = findActiveProfessionals(db);

	expect(found.ok).toBe(false);
	if (found.ok) return;
	expect(found.error.code).toBe("DatabaseFailed");
});
