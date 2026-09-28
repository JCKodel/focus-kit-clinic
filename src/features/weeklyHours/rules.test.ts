import { describe, expect, it } from "vitest";
import {
	isWorkingPeriod,
	setWeeklyHours,
	type WorkingPeriod,
} from "./rules.ts";

const slot = 30;

function monday(start: string, end: string): WorkingPeriod {
	return { weekday: 1, start, end };
}

describe("setWeeklyHours", () => {
	it("accepts an empty week", () => {
		expect(setWeeklyHours([], slot)).toEqual({ ok: true, value: [] });
	});

	it("accepts 00:00 and 23:55", () => {
		const week = [monday("00:00", "01:00"), monday("23:00", "23:55")];

		expect(setWeeklyHours(week, slot)).toEqual({ ok: true, value: week });
	});

	it("refuses 24:00, 9:00, 09:03 and an empty string", () => {
		for (const time of ["24:00", "9:00", "09:03", ""]) {
			expect(setWeeklyHours([monday(time, "23:00")], slot)).toEqual({
				ok: false,
				error: { code: "InvalidWorkingPeriod", index: 0 },
			});
			expect(setWeeklyHours([monday("08:00", time)], slot)).toEqual({
				ok: false,
				error: { code: "InvalidWorkingPeriod", index: 0 },
			});
		}
	});

	it("refuses an end equal to the start or before it", () => {
		for (const period of [monday("09:00", "09:00"), monday("13:00", "09:00")]) {
			expect(setWeeklyHours([period], slot)).toEqual({
				ok: false,
				error: { code: "InvalidWorkingPeriod", index: 0 },
			});
		}
	});

	it("accepts a period of exactly slotMinutes and refuses one 5 minutes shorter", () => {
		expect(setWeeklyHours([monday("09:00", "09:30")], slot).ok).toBe(true);
		expect(setWeeklyHours([monday("09:00", "09:25")], slot)).toEqual({
			ok: false,
			error: { code: "WorkingPeriodTooShort", index: 0 },
		});
		expect(setWeeklyHours([monday("09:00", "10:00")], 60).ok).toBe(true);
		expect(setWeeklyHours([monday("09:00", "09:55")], 60)).toEqual({
			ok: false,
			error: { code: "WorkingPeriodTooShort", index: 0 },
		});
	});

	it("accepts back-to-back periods", () => {
		const week = [monday("09:00", "13:00"), monday("13:00", "18:00")];

		expect(setWeeklyHours(week, slot)).toEqual({ ok: true, value: week });
	});

	it("refuses overlapping periods on one day, naming the later one", () => {
		expect(
			setWeeklyHours(
				[monday("12:00", "18:00"), monday("09:00", "13:00")],
				slot,
			),
		).toEqual({
			ok: false,
			error: { code: "WorkingPeriodsOverlap", index: 0 },
		});
		expect(
			setWeeklyHours(
				[monday("09:00", "18:00"), monday("10:00", "11:00")],
				slot,
			),
		).toEqual({
			ok: false,
			error: { code: "WorkingPeriodsOverlap", index: 1 },
		});
	});

	it("refuses equal periods on one day, naming the higher index", () => {
		const week = [
			monday("09:00", "13:00"),
			{ weekday: 2, start: "09:00", end: "13:00" } as const,
			monday("09:00", "13:00"),
		];

		expect(setWeeklyHours(week, slot)).toEqual({
			ok: false,
			error: { code: "WorkingPeriodsOverlap", index: 2 },
		});
	});

	it("accepts the same times on two weekdays", () => {
		const week: WorkingPeriod[] = [
			monday("09:00", "13:00"),
			{ weekday: 2, start: "09:00", end: "13:00" },
		];

		expect(setWeeklyHours(week, slot)).toEqual({ ok: true, value: week });
	});

	it("reports the first refused period, and overlap only when every period passes", () => {
		expect(
			setWeeklyHours(
				[
					monday("09:00", "13:00"),
					monday("10:00", "11:00"),
					monday("14:00", "14:10"),
					monday("16:00", "15:00"),
				],
				slot,
			),
		).toEqual({
			ok: false,
			error: { code: "WorkingPeriodTooShort", index: 2 },
		});
		expect(
			setWeeklyHours(
				[monday("09:00", "09:05"), monday("16:00", "15:00")],
				slot,
			),
		).toEqual({
			ok: false,
			error: { code: "WorkingPeriodTooShort", index: 0 },
		});
	});

	it("answers the periods ordered by weekday then start", () => {
		const week: WorkingPeriod[] = [
			{ weekday: 7, start: "10:00", end: "12:00" },
			{ weekday: 1, start: "14:00", end: "18:00" },
			{ weekday: 3, start: "09:00", end: "10:00" },
			{ weekday: 1, start: "09:00", end: "13:00" },
		];

		expect(setWeeklyHours(week, slot)).toEqual({
			ok: true,
			value: [week[3], week[1], week[2], week[0]],
		});
	});
});

describe("isWorkingPeriod", () => {
	it("accepts a weekday from 1 to 7 with two strings, whatever the times", () => {
		expect(isWorkingPeriod({ weekday: 1, start: "", end: "x" })).toBe(true);
		expect(isWorkingPeriod({ weekday: 7, start: "09:00", end: "13:00" })).toBe(
			true,
		);
	});

	it("refuses anything else", () => {
		for (const value of [
			null,
			"09:00",
			[],
			{},
			{ weekday: 0, start: "09:00", end: "13:00" },
			{ weekday: 8, start: "09:00", end: "13:00" },
			{ weekday: 1.5, start: "09:00", end: "13:00" },
			{ weekday: "1", start: "09:00", end: "13:00" },
			{ weekday: 1, start: 900, end: "13:00" },
			{ weekday: 1, start: "09:00" },
		]) {
			expect(isWorkingPeriod(value)).toBe(false);
		}
	});
});
