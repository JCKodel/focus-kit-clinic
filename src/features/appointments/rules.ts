import { checkName } from "../../lib/name.ts";
import { err, ok, type Result } from "../../lib/result.ts";
import type { WorkingPeriod } from "../weeklyHours/rules.ts";
import { addDays, clinicDateOf, instantAt, weekdayOf } from "./clinicTime.ts";

export const bookingWindowDays = 30;

// 31 characters, no 0, O, 1, I or L: the server draws 6 of them.
export const bookingCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const bookingCodeLength = 6;

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const windowMs = bookingWindowDays * 24 * hourMs;
const cancellationNoticeMs = 24 * hourMs;

export type SlotInput = {
	periods: WorkingPeriod[];
	// start instants of the professional's booked appointments
	booked: string[];
	timeZone: string;
	slotMinutes: number;
	now: Date;
};

export type BookingRequest = {
	startsAt: string;
	clientName: string;
	clientPhone: string;
};

export type BookingRefusal =
	| "InvalidClientName"
	| "InvalidPhoneNumber"
	| "OutsideBookingWindow"
	| "OutsideWorkingHours"
	| "SlotTaken";

export type Booking = {
	startsAt: string;
	clientName: string;
	clientPhone: string;
};

function minutesOf(time: string): number {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

// The free slot starts, as toISOString(), ascending (docs/03, invariants 1 to
// 3). Cut in clinic wall time from each period's start, for every clinic date
// from today's to that of the window's end; a slot starts after `now`, at
// most `bookingWindowDays` ahead, and overlaps no booked appointment.
export function freeSlots(input: SlotInput): string[] {
	const { periods, timeZone, slotMinutes, now } = input;
	const slotMs = slotMinutes * minuteMs;
	const from = now.getTime();
	const until = from + windowMs;
	const booked = input.booked.map((start) => Date.parse(start));
	const lastDate = clinicDateOf(new Date(until), timeZone);

	const starts: number[] = [];
	for (
		let date = clinicDateOf(now, timeZone);
		date <= lastDate;
		date = addDays(date, 1)
	) {
		const weekday = weekdayOf(date);
		for (const period of periods) {
			if (period.weekday !== weekday) continue;
			const end = minutesOf(period.end);
			for (
				let minutes = minutesOf(period.start);
				minutes + slotMinutes <= end;
				minutes += slotMinutes
			) {
				const instant = instantAt(date, minutes, timeZone)?.getTime();
				if (instant === undefined || instant <= from || instant > until) {
					continue;
				}
				const taken = booked.some(
					(start) => instant < start + slotMs && start < instant + slotMs,
				);
				if (!taken) starts.push(instant);
			}
		}
	}
	return starts
		.sort((a, b) => a - b)
		.map((instant) => new Date(instant).toISOString());
}

// The trimmed name to store. Third use of checkName.
export function checkClientName(
	raw: string,
): Result<string, "InvalidClientName"> {
	const name = checkName(raw);
	return name.ok ? name : err("InvalidClientName");
}

const phoneCharacters = /^[\d +\-.()]*$/;

// The digits to store: only digits, spaces, +, -, . and brackets typed, and
// 6 to 15 digits.
export function checkClientPhone(
	raw: string,
): Result<string, "InvalidPhoneNumber"> {
	if (!phoneCharacters.test(raw)) return err("InvalidPhoneNumber");
	const digits = raw.replace(/\D/g, "");
	if (digits.length < 6 || digits.length > 15) {
		return err("InvalidPhoneNumber");
	}
	return ok(digits);
}

// The appointment to store, checked in order: name, phone, window, hours,
// taken. `startsAt` comes back as toISOString().
export function book(
	request: BookingRequest,
	input: SlotInput,
): Result<Booking, BookingRefusal> {
	const clientName = checkClientName(request.clientName);
	if (!clientName.ok) return clientName;
	const clientPhone = checkClientPhone(request.clientPhone);
	if (!clientPhone.ok) return clientPhone;

	const start = Date.parse(request.startsAt);
	const now = input.now.getTime();
	// A start that is not a date is in no window.
	if (!(start > now && start <= now + windowMs)) {
		return err("OutsideBookingWindow");
	}
	const startsAt = new Date(start).toISOString();
	if (!freeSlots({ ...input, booked: [] }).includes(startsAt)) {
		return err("OutsideWorkingHours");
	}
	if (!freeSlots(input).includes(startsAt)) return err("SlotTaken");
	return ok({
		startsAt,
		clientName: clientName.value,
		clientPhone: clientPhone.value,
	});
}

// 24 hours before the appointment starts.
export function cancellationDeadline(startsAt: string): Date {
	return new Date(Date.parse(startsAt) - cancellationNoticeMs);
}

// A cancellation succeeds while `now` is at or before the deadline (docs/03,
// invariant 4). A start that is not a date has no deadline to be before.
export function cancel(
	startsAt: string,
	now: Date,
): Result<void, "CancellationTooLate"> {
	return now.getTime() <= cancellationDeadline(startsAt).getTime()
		? ok(undefined)
		: err("CancellationTooLate");
}

// The code as stored: trimmed, upper-cased, `bookingCodeLength` characters of
// the alphabet. Anything else cannot be a code, so it matches no appointment.
export function normalizeBookingCode(
	raw: string,
): Result<string, "AppointmentNotFound"> {
	const code = raw.trim().toUpperCase();
	const valid =
		code.length === bookingCodeLength &&
		[...code].every((c) => bookingCodeAlphabet.includes(c));
	return valid ? ok(code) : err("AppointmentNotFound");
}
