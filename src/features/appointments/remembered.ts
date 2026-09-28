import { err, ok, type Result } from "../../lib/result.ts";

// The copy of a booked appointment the client's phone keeps (docs/03).
export type RememberedAppointment = {
	bookingCode: string;
	// digits
	clientPhone: string;
	professionalName: string;
	// UTC instant
	startsAt: string;
	timeZone: string;
};

export type StorageFailed = { code: "StorageFailed" };

const key = "appointments";

function isRemembered(value: unknown): value is RememberedAppointment {
	if (typeof value !== "object" || value === null) return false;
	const fields = [
		"bookingCode",
		"clientPhone",
		"professionalName",
		"startsAt",
		"timeZone",
	];
	return fields.every((field) => typeof Reflect.get(value, field) === "string");
}

// Every stored appointment; a missing or unreadable value is none.
function readAll(): RememberedAppointment[] {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
		return Array.isArray(stored) ? stored.filter(isRemembered) : [];
	} catch {
		return [];
	}
}

function toCome(
	appointments: RememberedAppointment[],
	now: Date,
): RememberedAppointment[] {
	return appointments
		.filter((a) => Date.parse(a.startsAt) > now.getTime())
		.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

// The remembered appointments still to come, earliest first.
export function readRemembered(now: Date): RememberedAppointment[] {
	return toCome(readAll(), now);
}

const listeners = new Set<() => void>();

// Called on each change, so the list on the home page follows a booking.
export function onRememberedChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

// Adds the new appointment and drops those whose start is past. A storage
// failure (private mode, full) is a Result the caller may ignore.
export function remember(
	appointment: RememberedAppointment,
	now: Date,
): Result<void, StorageFailed> {
	try {
		const kept = toCome([...readAll(), appointment], now);
		localStorage.setItem(key, JSON.stringify(kept));
	} catch {
		return err({ code: "StorageFailed" });
	}
	for (const listener of listeners) listener();
	return ok(undefined);
}
