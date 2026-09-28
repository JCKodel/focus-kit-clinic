import type { Weekday } from "../weeklyHours/rules.ts";

// Clinic time conversions, built on Intl.DateTimeFormat, no date library.
// A date is "YYYY-MM-DD"; minutes count from its midnight. First use:
// book-appointment; owner-schedule would be the second.

export type WallTime = { date: string; minutes: number };

const dayMs = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterOf(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

type Fields = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
};

function fieldsOf(instant: number, timeZone: string): Fields {
	const fields: Fields = {
		year: 0,
		month: 0,
		day: 0,
		hour: 0,
		minute: 0,
		second: 0,
	};
	for (const part of formatterOf(timeZone).formatToParts(instant)) {
		if (part.type in fields) {
			fields[part.type as keyof Fields] = Number(part.value);
		}
	}
	return fields;
}

function pad(value: number, length = 2): string {
	return String(value).padStart(length, "0");
}

function dateOf(year: number, month: number, day: number): string {
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function utcOf(date: string): number {
	return Date.UTC(
		Number(date.slice(0, 4)),
		Number(date.slice(5, 7)) - 1,
		Number(date.slice(8, 10)),
	);
}

// How far the clinic's wall clock is ahead of UTC at an instant on a whole
// second, in ms.
function offsetAt(instant: number, timeZone: string): number {
	const f = fieldsOf(instant, timeZone);
	const wall = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
	return wall - instant;
}

// The clinic date and minute of an instant.
export function wallTimeOf(instant: Date, timeZone: string): WallTime {
	const f = fieldsOf(instant.getTime(), timeZone);
	return {
		date: dateOf(f.year, f.month, f.day),
		minutes: f.hour * 60 + f.minute,
	};
}

export function clinicDateOf(instant: Date, timeZone: string): string {
	return wallTimeOf(instant, timeZone).date;
}

// The ISO weekday of a date: 1 Monday to 7 Sunday.
export function weekdayOf(date: string): Weekday {
	return (((new Date(utcOf(date)).getUTCDay() + 6) % 7) + 1) as Weekday;
}

export function addDays(date: string, days: number): string {
	return new Date(utcOf(date) + days * dayMs).toISOString().slice(0, 10);
}

// The instant the clinic's wall clock reads `minutes` on `date`. A wall time
// that does not exist (spring forward) is undefined; one that happens twice
// (fall back) is its first instant. The offsets a day before and a day after
// are the only two a wall time can have, as a zone changes offset at most
// once in two days.
export function instantAt(
	date: string,
	minutes: number,
	timeZone: string,
): Date | undefined {
	const asUtc = utcOf(date) + minutes * 60 * 1000;
	const offsets = [
		offsetAt(asUtc - dayMs, timeZone),
		offsetAt(asUtc + dayMs, timeZone),
	];
	const matching = offsets
		.map((offset) => asUtc - offset)
		.filter((instant) => {
			const wall = wallTimeOf(new Date(instant), timeZone);
			return wall.date === date && wall.minutes === minutes;
		})
		.sort((a, b) => a - b);
	return matching.length === 0 ? undefined : new Date(matching[0]);
}
