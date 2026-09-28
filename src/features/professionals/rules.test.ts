import { describe, expect, it } from "vitest";
import {
	addProfessional,
	type Professional,
	removeProfessional,
	renameProfessional,
	sortByName,
} from "./rules.ts";

const ana: Professional = { id: 1, name: "Ana Costa" };
const rui: Professional = { id: 2, name: "Rui Lopes" };
const active = [ana, rui];

describe("addProfessional", () => {
	it("gives the name trimmed", () => {
		expect(addProfessional("  Maria Sousa ", active)).toEqual({
			ok: true,
			value: "Maria Sousa",
		});
	});

	it("refuses a blank name and one of spaces only", () => {
		for (const raw of ["", "   "]) {
			expect(addProfessional(raw, active)).toEqual({
				ok: false,
				error: "InvalidProfessionalName",
			});
		}
	});

	it("accepts 80 characters and refuses 81, also in é", () => {
		for (const letter of ["a", "é"]) {
			expect(addProfessional(letter.repeat(80), active).ok).toBe(true);
			expect(addProfessional(letter.repeat(81), active)).toEqual({
				ok: false,
				error: "InvalidProfessionalName",
			});
		}
	});

	it("refuses a name taken in another case and with spaces", () => {
		for (const raw of ["Ana Costa", "ana costa", "  ANA COSTA  "]) {
			expect(addProfessional(raw, active)).toEqual({
				ok: false,
				error: "ProfessionalNameTaken",
			});
		}
	});

	it("compares accented letters in another case", () => {
		expect(addProfessional("álvaro", [{ id: 3, name: "Álvaro" }])).toEqual({
			ok: false,
			error: "ProfessionalNameTaken",
		});
	});

	it("frees the name of a removed professional", () => {
		// A removed professional is not in the active list.
		expect(addProfessional("Ana Costa", [rui])).toEqual({
			ok: true,
			value: "Ana Costa",
		});
	});

	it("checks the name before whether it is taken", () => {
		expect(addProfessional(" ", [{ id: 3, name: " " }])).toEqual({
			ok: false,
			error: "InvalidProfessionalName",
		});
	});
});

describe("renameProfessional", () => {
	it("gives the new name trimmed", () => {
		expect(renameProfessional(2, " Rui M. Lopes ", active)).toEqual({
			ok: true,
			value: "Rui M. Lopes",
		});
	});

	it("accepts the professional's own name, also in another case", () => {
		expect(renameProfessional(1, "Ana Costa", active)).toEqual({
			ok: true,
			value: "Ana Costa",
		});
		expect(renameProfessional(1, " ANA costa ", active)).toEqual({
			ok: true,
			value: "ANA costa",
		});
	});

	it("refuses another active professional's name, in any case", () => {
		expect(renameProfessional(1, " rui lopes ", active)).toEqual({
			ok: false,
			error: "ProfessionalNameTaken",
		});
	});

	it("refuses a blank name and one over 80 characters", () => {
		for (const raw of ["", "  ", "é".repeat(81)]) {
			expect(renameProfessional(1, raw, active)).toEqual({
				ok: false,
				error: "InvalidProfessionalName",
			});
		}
		expect(renameProfessional(1, "é".repeat(80), active).ok).toBe(true);
	});

	it("answers not found before a bad name", () => {
		expect(renameProfessional(9, "", active)).toEqual({
			ok: false,
			error: "ProfessionalNotFound",
		});
	});

	it("answers not found for a removed professional", () => {
		expect(renameProfessional(1, "Ana", [rui])).toEqual({
			ok: false,
			error: "ProfessionalNotFound",
		});
	});
});

describe("removeProfessional", () => {
	it("gives the removal instant equal to now", () => {
		const now = new Date("2026-09-28T10:15:00.000Z");

		expect(removeProfessional(1, active, now)).toEqual({
			ok: true,
			value: "2026-09-28T10:15:00.000Z",
		});
	});

	it("answers not found for an unknown or removed professional", () => {
		const now = new Date("2026-09-28T10:15:00.000Z");

		expect(removeProfessional(9, active, now)).toEqual({
			ok: false,
			error: "ProfessionalNotFound",
		});
		expect(removeProfessional(1, [rui], now)).toEqual({
			ok: false,
			error: "ProfessionalNotFound",
		});
	});
});

describe("sortByName", () => {
	it("sorts alphabetically, ignoring case", () => {
		const list = [
			{ id: 1, name: "carla" },
			{ id: 2, name: "Bruno" },
			{ id: 3, name: "ana" },
			{ id: 4, name: "Álvaro" },
		];

		expect(sortByName(list).map((p) => p.name)).toEqual([
			"Álvaro",
			"ana",
			"Bruno",
			"carla",
		]);
	});

	it("breaks ties by id", () => {
		const list = [
			{ id: 7, name: "ana" },
			{ id: 3, name: "Ana" },
			{ id: 5, name: "ANA" },
		];

		expect(sortByName(list).map((p) => p.id)).toEqual([3, 5, 7]);
	});

	it("leaves the given list unchanged", () => {
		const list = [rui, ana];

		sortByName(list);

		expect(list).toEqual([rui, ana]);
	});
});
