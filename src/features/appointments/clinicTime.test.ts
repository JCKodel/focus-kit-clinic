import { describe, expect, it } from "vitest";
import {
	addDays,
	clinicDateOf,
	instantAt,
	wallTimeOf,
	weekdayOf,
} from "./clinicTime.ts";

const lisbon = "Europe/Lisbon";

describe("wallTimeOf and clinicDateOf", () => {
	it("read the clinic date and minute of an instant", () => {
		expect(wallTimeOf(new Date("2026-09-29T08:30:00.000Z"), lisbon)).toEqual({
			date: "2026-09-29",
			minutes: 9 * 60 + 30,
		});
		expect(
			wallTimeOf(new Date("2026-09-29T12:05:00.000Z"), "America/Sao_Paulo"),
		).toEqual({ date: "2026-09-29", minutes: 9 * 60 + 5 });
	});

	it("give the clinic's date, not UTC's, around midnight", () => {
		expect(clinicDateOf(new Date("2026-09-28T23:30:00.000Z"), lisbon)).toBe(
			"2026-09-29",
		);
		expect(
			clinicDateOf(new Date("2026-09-29T02:00:00.000Z"), "America/Sao_Paulo"),
		).toBe("2026-09-28");
	});

	it("read midnight as minute 0", () => {
		expect(wallTimeOf(new Date("2026-09-28T23:00:00.000Z"), lisbon)).toEqual({
			date: "2026-09-29",
			minutes: 0,
		});
	});
});

describe("weekdayOf and addDays", () => {
	it("give the ISO weekday of a date", () => {
		expect(weekdayOf("2026-09-28")).toBe(1);
		expect(weekdayOf("2026-09-29")).toBe(2);
		expect(weekdayOf("2026-10-04")).toBe(7);
	});

	it("add days across a month, a year and a clock change", () => {
		expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
		expect(addDays("2026-09-28", 30)).toBe("2026-10-28");
	});
});

describe("instantAt", () => {
	it("gives the instant of a wall time", () => {
		expect(instantAt("2026-09-29", 9 * 60, lisbon)).toEqual(
			new Date("2026-09-29T08:00:00.000Z"),
		);
		expect(instantAt("2026-12-01", 9 * 60, lisbon)).toEqual(
			new Date("2026-12-01T09:00:00.000Z"),
		);
		expect(instantAt("2026-09-29", 9 * 60, "America/Sao_Paulo")).toEqual(
			new Date("2026-09-29T12:00:00.000Z"),
		);
	});

	it("gives nothing for a wall time the spring forward skips", () => {
		expect(instantAt("2027-03-28", 60, lisbon)).toBeUndefined();
		expect(instantAt("2027-03-28", 90, lisbon)).toBeUndefined();
		expect(instantAt("2027-03-28", 120, lisbon)).toEqual(
			new Date("2027-03-28T01:00:00.000Z"),
		);
	});

	it("gives the first instant of a wall time the fall back repeats", () => {
		expect(instantAt("2026-10-25", 90, lisbon)).toEqual(
			new Date("2026-10-25T00:30:00.000Z"),
		);
		expect(instantAt("2026-10-25", 120, lisbon)).toEqual(
			new Date("2026-10-25T02:00:00.000Z"),
		);
	});

	it("gives midnight and the last minute of a day", () => {
		expect(instantAt("2026-09-29", 0, lisbon)).toEqual(
			new Date("2026-09-28T23:00:00.000Z"),
		);
		expect(instantAt("2026-09-29", 23 * 60 + 55, lisbon)).toEqual(
			new Date("2026-09-29T22:55:00.000Z"),
		);
	});
});
