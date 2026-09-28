import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	onRememberedChange,
	type RememberedAppointment,
	readRemembered,
	remember,
} from "./remembered.ts";

let stored: Map<string, string>;

beforeEach(() => {
	stored = new Map();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => stored.set(key, value),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const now = new Date("2026-09-28T12:00:00.000Z");

function appointment(startsAt: string, bookingCode: string) {
	return {
		bookingCode,
		clientPhone: "912345678",
		professionalName: "Ana Lima",
		startsAt,
		timeZone: "Europe/Lisbon",
	} satisfies RememberedAppointment;
}

const later = appointment("2026-10-02T08:00:00.000Z", "LATER2");
const sooner = appointment("2026-09-29T08:00:00.000Z", "SOON22");
const past = appointment("2026-09-28T11:30:00.000Z", "PAST22");

it("reads nothing when the key is missing or unreadable", () => {
	expect(readRemembered(now)).toEqual([]);
	for (const value of ["not json", "{}", "[1, null]", '[{"bookingCode": 1}]']) {
		stored.set("appointments", value);
		expect(readRemembered(now)).toEqual([]);
	}
});

it("adds the new one, drops the past ones, and reads them earliest first", () => {
	stored.set("appointments", JSON.stringify([later, past]));

	expect(remember(sooner, now)).toEqual({ ok: true, value: undefined });

	expect(JSON.parse(stored.get("appointments") ?? "")).toEqual([sooner, later]);
	expect(readRemembered(now)).toEqual([sooner, later]);
});

it("reads only the ones still to come", () => {
	stored.set("appointments", JSON.stringify([later, sooner]));

	expect(readRemembered(new Date("2026-09-30T00:00:00.000Z"))).toEqual([later]);
});

it("tells the listeners after a write", () => {
	const listener = vi.fn();
	const stop = onRememberedChange(listener);

	remember(sooner, now);
	stop();
	remember(later, now);

	expect(listener).toHaveBeenCalledTimes(1);
});

it("answers StorageFailed when the phone refuses to store", () => {
	vi.stubGlobal("localStorage", {
		getItem: () => null,
		setItem: () => {
			throw new Error("QuotaExceededError");
		},
	});

	expect(remember(sooner, now)).toEqual({
		ok: false,
		error: { code: "StorageFailed" },
	});
});
