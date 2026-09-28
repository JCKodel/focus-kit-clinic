import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import { insertProfessional } from "../professionals/repository.server.ts";
import {
	findWorkingPeriods,
	replaceWorkingPeriods,
} from "./repository.server.ts";
import type { WorkingPeriod } from "./rules.ts";

let db: DatabaseSync;

beforeEach(() => {
	db = memoryDatabase();
	insertProfessional(db, "Ana Costa");
	insertProfessional(db, "Rui Lopes");
});

afterEach(() => {
	db.close();
});

const week: WorkingPeriod[] = [
	{ weekday: 1, start: "09:00", end: "13:00" },
	{ weekday: 1, start: "14:00", end: "18:00" },
	{ weekday: 5, start: "10:00", end: "12:00" },
];

it("finds no period at first", () => {
	expect(findWorkingPeriods(db, 1)).toEqual({ ok: true, value: [] });
});

it("replaces a week and reads it back ordered by weekday then start", () => {
	const shuffled = [week[2], week[1], week[0]];

	expect(replaceWorkingPeriods(db, 1, shuffled)).toEqual({
		ok: true,
		value: undefined,
	});

	expect(findWorkingPeriods(db, 1)).toEqual({ ok: true, value: week });
});

it("replaces the first save with the second", () => {
	replaceWorkingPeriods(db, 1, week);
	const second: WorkingPeriod[] = [
		{ weekday: 2, start: "08:00", end: "12:00" },
	];

	replaceWorkingPeriods(db, 1, second);

	expect(findWorkingPeriods(db, 1)).toEqual({ ok: true, value: second });
	replaceWorkingPeriods(db, 1, []);
	expect(findWorkingPeriods(db, 1)).toEqual({ ok: true, value: [] });
});

it("leaves other professionals' periods untouched", () => {
	const theirs: WorkingPeriod[] = [
		{ weekday: 3, start: "09:00", end: "17:00" },
	];
	replaceWorkingPeriods(db, 2, theirs);

	replaceWorkingPeriods(db, 1, week);
	replaceWorkingPeriods(db, 1, []);

	expect(findWorkingPeriods(db, 2)).toEqual({ ok: true, value: theirs });
});

it("keeps the previous week when a row is refused", () => {
	replaceWorkingPeriods(db, 1, week);

	const saved = replaceWorkingPeriods(db, 1, [
		{ weekday: 2, start: "09:00", end: "13:00" },
		{ weekday: 2, start: "13:00", end: "09:00" },
	]);

	expect(saved.ok).toBe(false);
	if (!saved.ok) expect(saved.error.code).toBe("DatabaseFailed");
	expect(findWorkingPeriods(db, 1)).toEqual({ ok: true, value: week });
	expect(db.isTransaction).toBe(false);
});
