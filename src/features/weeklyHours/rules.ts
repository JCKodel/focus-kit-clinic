import { err, ok, type Result } from "../../lib/result.ts";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WorkingPeriod = { weekday: Weekday; start: string; end: string };

export type WeeklyHoursRefusal =
	| "InvalidWorkingPeriod"
	| "WorkingPeriodTooShort"
	| "WorkingPeriodsOverlap";

export type WeeklyHoursError = {
	code: WeeklyHoursRefusal;
	// position of the refused period in the input array
	index: number;
};

// ISO order: Monday first.
export const weekdays: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

// 00:00 to 23:55, zero-padded, on a 5 minute step.
const validTime = /^([01]\d|2[0-3]):[0-5][05]$/;

function minutesOf(time: string): number {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function isWeekday(value: unknown): value is Weekday {
	return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 7;
}

// The shape of one period, whatever its times: the route reads a request
// body with it and api.ts reads the answer.
export function isWorkingPeriod(value: unknown): value is WorkingPeriod {
	if (typeof value !== "object" || value === null) return false;
	const weekday: unknown = Reflect.get(value, "weekday");
	const start: unknown = Reflect.get(value, "start");
	const end: unknown = Reflect.get(value, "end");
	return (
		isWeekday(weekday) && typeof start === "string" && typeof end === "string"
	);
}

function byWeekdayThenStart(a: WorkingPeriod, b: WorkingPeriod): number {
	return a.weekday - b.weekday || minutesOf(a.start) - minutesOf(b.start);
}

// The periods to store, ordered by weekday then start (docs/03, invariant
// 11). Each period in input order: invalid, then too short; only when every
// period passes, overlap, naming the later of the two (on equal starts, the
// higher input index).
export function setWeeklyHours(
	periods: WorkingPeriod[],
	slotMinutes: number,
): Result<WorkingPeriod[], WeeklyHoursError> {
	for (const [index, period] of periods.entries()) {
		if (
			!validTime.test(period.start) ||
			!validTime.test(period.end) ||
			minutesOf(period.end) <= minutesOf(period.start)
		) {
			return err({ code: "InvalidWorkingPeriod", index });
		}
		if (minutesOf(period.end) - minutesOf(period.start) < slotMinutes) {
			return err({ code: "WorkingPeriodTooShort", index });
		}
	}

	const ordered = periods
		.map((period, index) => ({ period, index }))
		.sort(
			(a, b) => byWeekdayThenStart(a.period, b.period) || a.index - b.index,
		);
	for (const [position, { period, index }] of ordered.entries()) {
		const before = ordered.slice(0, position).map((o) => o.period);
		const overlaps = before.some(
			(other) =>
				other.weekday === period.weekday &&
				minutesOf(period.start) < minutesOf(other.end),
		);
		if (overlaps) return err({ code: "WorkingPeriodsOverlap", index });
	}
	return ok(ordered.map((o) => o.period));
}
