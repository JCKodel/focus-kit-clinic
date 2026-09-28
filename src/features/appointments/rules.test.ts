import { describe, expect, it } from "vitest";
import type { WorkingPeriod } from "../weeklyHours/rules.ts";
import {
	type BookingRequest,
	book,
	cancel,
	cancellationDeadline,
	checkClientName,
	checkClientPhone,
	freeSlots,
	normalizeBookingCode,
	type SlotInput,
} from "./rules.ts";

// Monday 28 September 2026, 01:00 in Lisbon (WEST, UTC+1).
const monday = new Date("2026-09-28T00:00:00.000Z");

const tuesday = (start: string, end: string): WorkingPeriod => ({
	weekday: 2,
	start,
	end,
});

function input(overrides: Partial<SlotInput> = {}): SlotInput {
	return {
		periods: [tuesday("09:00", "11:00")],
		booked: [],
		timeZone: "Europe/Lisbon",
		slotMinutes: 30,
		now: monday,
		...overrides,
	};
}

// The slots whose UTC instant falls on `date`.
function on(slots: string[], date: string): string[] {
	return slots.filter((slot) => slot.startsWith(date));
}

const at = (time: string, date = "2026-09-29") => `${date}T${time}:00.000Z`;

describe("freeSlots", () => {
	it("cuts the grid from each period's start", () => {
		const slots = freeSlots(input({ periods: [tuesday("09:10", "10:40")] }));

		expect(on(slots, "2026-09-29")).toEqual([
			at("08:10"),
			at("08:40"),
			at("09:10"),
		]);
	});

	it("drops the tail of a period that is not a multiple of slotMinutes", () => {
		const slots = freeSlots(input({ periods: [tuesday("09:00", "10:45")] }));

		expect(on(slots, "2026-09-29")).toEqual([
			at("08:00"),
			at("08:30"),
			at("09:00"),
		]);
	});

	it("offers every Tuesday of the window, ascending", () => {
		const slots = freeSlots(input({ periods: [tuesday("09:00", "09:30")] }));

		// 27 October is after the fall back: 09:00 in Lisbon is 09:00 UTC.
		expect(slots).toEqual([
			at("08:00", "2026-09-29"),
			at("08:00", "2026-10-06"),
			at("08:00", "2026-10-13"),
			at("08:00", "2026-10-20"),
			at("09:00", "2026-10-27"),
		]);
	});

	it("offers nothing at or before now", () => {
		const slots = freeSlots(input({ now: new Date(at("08:30")) }));

		expect(on(slots, "2026-09-29")).toEqual([at("09:00"), at("09:30")]);
	});

	it("includes the window's last instant and excludes one step later", () => {
		// Tuesday 09:00 in Lisbon; the window ends Thursday 29 October 08:00
		// UTC, 08:00 in Lisbon after the fall back.
		const slots = freeSlots(
			input({
				now: new Date(at("08:00")),
				periods: [{ weekday: 4, start: "07:00", end: "10:00" }],
			}),
		);

		expect(on(slots, "2026-10-29")).toEqual([
			at("07:00", "2026-10-29"),
			at("07:30", "2026-10-29"),
			at("08:00", "2026-10-29"),
		]);
		expect(slots.at(-1)).toBe(at("08:00", "2026-10-29"));
	});

	it("removes a booked slot", () => {
		const slots = freeSlots(input({ booked: [at("08:30")] }));

		expect(on(slots, "2026-09-29")).toEqual([
			at("08:00"),
			at("09:00"),
			at("09:30"),
		]);
	});

	it("removes each slot a booked appointment off the grid overlaps", () => {
		const slots = freeSlots(input({ booked: [at("08:15")] }));

		expect(on(slots, "2026-09-29")).toEqual([at("09:00"), at("09:30")]);
	});

	it("keeps a slot that only touches a booked appointment", () => {
		const slots = freeSlots(input({ booked: ["2026-09-29T07:30:00.000Z"] }));

		expect(on(slots, "2026-09-29")).toHaveLength(4);
	});

	it("merges two periods on one day in order of start", () => {
		const slots = freeSlots(
			input({
				periods: [tuesday("14:00", "15:00"), tuesday("09:00", "10:00")],
			}),
		);

		expect(on(slots, "2026-09-29")).toEqual([
			at("08:00"),
			at("08:30"),
			at("13:00"),
			at("13:30"),
		]);
	});

	it("gives no slot in the hour Lisbon skips when it springs forward", () => {
		// Sunday 28 March 2027: 01:00 WET becomes 02:00 WEST.
		const slots = freeSlots(
			input({
				now: new Date("2027-03-01T00:00:00.000Z"),
				periods: [{ weekday: 7, start: "00:00", end: "03:00" }],
			}),
		);

		expect(on(slots, "2027-03-28")).toEqual([
			at("00:00", "2027-03-28"),
			at("00:30", "2027-03-28"),
			at("01:00", "2027-03-28"),
			at("01:30", "2027-03-28"),
		]);
	});

	it("gives 01:30 once, its first instant, when Lisbon falls back", () => {
		// Sunday 25 October 2026: 02:00 WEST becomes 01:00 WET.
		const slots = freeSlots(
			input({
				now: new Date("2026-10-01T00:00:00.000Z"),
				periods: [{ weekday: 7, start: "01:00", end: "03:00" }],
			}),
		);

		expect(on(slots, "2026-10-25")).toEqual([
			at("00:00", "2026-10-25"),
			at("00:30", "2026-10-25"),
			at("02:00", "2026-10-25"),
			at("02:30", "2026-10-25"),
		]);
	});

	it("gives the right UTC starts in America/Sao_Paulo", () => {
		const slots = freeSlots(
			input({
				timeZone: "America/Sao_Paulo",
				periods: [tuesday("09:00", "10:00")],
			}),
		);

		expect(on(slots, "2026-09-29")).toEqual([at("12:00"), at("12:30")]);
	});

	it("gives nothing without periods", () => {
		expect(freeSlots(input({ periods: [] }))).toEqual([]);
	});
});

describe("book", () => {
	const valid: BookingRequest = {
		startsAt: at("08:00"),
		clientName: "  Rita Sousa ",
		clientPhone: "912 345 678",
	};

	const request = (overrides: Partial<BookingRequest>) => ({
		...valid,
		...overrides,
	});

	it("answers the appointment to store: trimmed name, phone digits", () => {
		expect(book(valid, input())).toEqual({
			ok: true,
			value: {
				startsAt: at("08:00"),
				clientName: "Rita Sousa",
				clientPhone: "912345678",
			},
		});
	});

	it("normalizes startsAt with toISOString()", () => {
		const booked = book(
			request({ startsAt: "2026-09-29T09:00:00+01:00" }),
			input(),
		);

		expect(booked.ok && booked.value.startsAt).toBe(at("08:00"));
	});

	it("checks name, then phone, then window, then hours, then taken", () => {
		const taken = input({ booked: [at("08:00")] });
		const refusal = (overrides: Partial<BookingRequest>) => {
			const booked = book(request(overrides), taken);
			return booked.ok ? "booked" : booked.error;
		};

		expect(
			refusal({ clientName: "", clientPhone: "x", startsAt: at("08:10") }),
		).toBe("InvalidClientName");
		expect(refusal({ clientPhone: "x", startsAt: "2026-09-27T08:00Z" })).toBe(
			"InvalidPhoneNumber",
		);
		expect(refusal({ startsAt: "2026-09-27T08:10:00.000Z" })).toBe(
			"OutsideBookingWindow",
		);
		expect(refusal({ startsAt: at("08:10") })).toBe("OutsideWorkingHours");
		expect(refusal({ startsAt: at("08:00") })).toBe("SlotTaken");
		expect(refusal({ startsAt: at("08:30") })).toBe("booked");
	});

	it("refuses a blank name and one of 81 characters", () => {
		for (const clientName of ["", "   ", "a".repeat(81)]) {
			expect(book(request({ clientName }), input())).toEqual({
				ok: false,
				error: "InvalidClientName",
			});
		}
		expect(book(request({ clientName: "a".repeat(80) }), input()).ok).toBe(
			true,
		);
	});

	it("accepts phones with spaces, +, -, . and brackets, as digits", () => {
		for (const [clientPhone, digits] of [
			["912 345 678", "912345678"],
			["+351 (91) 234-5678", "351912345678"],
			["91.234.56", "9123456"],
			["123456", "123456"],
			["123456789012345", "123456789012345"],
		]) {
			const booked = book(request({ clientPhone }), input());
			expect(booked.ok && booked.value.clientPhone).toBe(digits);
		}
	});

	it("refuses 5 digits, 16 digits and a letter", () => {
		for (const clientPhone of [
			"12345",
			"1234567890123456",
			"91a2345678",
			"",
			"+-. ()",
		]) {
			expect(book(request({ clientPhone }), input())).toEqual({
				ok: false,
				error: "InvalidPhoneNumber",
			});
		}
	});

	it("refuses a start off the grid as outside working hours", () => {
		for (const startsAt of [at("08:10"), at("10:00"), at("07:30")]) {
			expect(book(request({ startsAt }), input())).toEqual({
				ok: false,
				error: "OutsideWorkingHours",
			});
		}
	});

	it("refuses a past start and one 31 days ahead as outside the window", () => {
		for (const startsAt of [
			"2026-09-22T08:00:00.000Z",
			monday.toISOString(),
			"2026-10-29T09:00:00.000Z",
		]) {
			expect(book(request({ startsAt }), input())).toEqual({
				ok: false,
				error: "OutsideBookingWindow",
			});
		}
	});

	it("refuses a slot a booked appointment off the grid overlaps", () => {
		expect(book(valid, input({ booked: [at("07:45")] }))).toEqual({
			ok: false,
			error: "SlotTaken",
		});
	});
});

describe("checkClientName and checkClientPhone", () => {
	it("answer the value to store", () => {
		expect(checkClientName(" Rita ")).toEqual({ ok: true, value: "Rita" });
		expect(checkClientPhone("(91) 234-5678")).toEqual({
			ok: true,
			value: "912345678",
		});
	});
});

describe("cancellationDeadline", () => {
	it("is 24 hours before the start", () => {
		expect(cancellationDeadline(at("08:00"))).toEqual(
			new Date("2026-09-28T08:00:00.000Z"),
		);
	});

	it("is 24 hours of instants across a clock change", () => {
		expect(cancellationDeadline("2026-10-25T12:00:00.000Z")).toEqual(
			new Date("2026-10-24T12:00:00.000Z"),
		);
	});
});

describe("cancel", () => {
	// The deadline of at("08:00") is Monday 28 September, 08:00 UTC.
	const deadline = Date.parse("2026-09-28T08:00:00.000Z");

	it("succeeds one millisecond before and exactly at the deadline", () => {
		for (const now of [deadline - 1, deadline]) {
			expect(cancel(at("08:00"), new Date(now))).toEqual({
				ok: true,
				value: undefined,
			});
		}
	});

	it("is too late one millisecond after the deadline", () => {
		expect(cancel(at("08:00"), new Date(deadline + 1))).toEqual({
			ok: false,
			error: "CancellationTooLate",
		});
	});

	it("is too late for a start already past", () => {
		expect(cancel(at("08:00"), new Date(at("09:00")))).toEqual({
			ok: false,
			error: "CancellationTooLate",
		});
	});
});

describe("normalizeBookingCode", () => {
	it("trims and upper-cases", () => {
		expect(normalizeBookingCode(" k7mxq2 ")).toEqual({
			ok: true,
			value: "K7MXQ2",
		});
		expect(normalizeBookingCode("K7MXQ2")).toEqual({
			ok: true,
			value: "K7MXQ2",
		});
	});

	it("refuses 5 and 7 characters, characters outside the alphabet, and blank", () => {
		for (const raw of [
			"K7MXQ",
			"K7MXQ22",
			"K7MXQ0",
			"K7MXQO",
			"K7MXQI",
			"K7MXQL",
			"k7mxql",
			"K7MXQ1",
			"K7M XQ",
			"",
			"      ",
		]) {
			expect(normalizeBookingCode(raw)).toEqual({
				ok: false,
				error: "AppointmentNotFound",
			});
		}
	});
});
