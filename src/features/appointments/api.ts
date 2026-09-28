import { request, type ServerUnreachable } from "../../lib/request.ts";
import type { Result } from "../../lib/result.ts";
import type { Professional } from "../professionals/rules.ts";

export type Slots = { timeZone: string; slots: string[] };

export type Booked = {
	bookingCode: string;
	startsAt: string;
	clientPhone: string;
	professional: Professional;
};

type NotFound = { code: "ProfessionalNotFound" };
// OutsideBookingWindow, OutsideWorkingHours and SlotTaken share 409 and are
// shown alike: the time is not free.
type NotFree = { code: "SlotTaken" };

export type Cancelled = {
	startsAt: string;
	timeZone: string;
	professional: Professional;
};

type NotBooked = { code: "AppointmentNotFound" };
type TooLate = { code: "CancellationTooLate" };

export type SlotsError = NotFound | ServerUnreachable;
export type BookError = NotFound | NotFree | ServerUnreachable;
export type CancelError = NotBooked | TooLate | ServerUnreachable;

export type BookingBody = {
	professionalId: number;
	startsAt: string;
	clientName: string;
	clientPhone: string;
};

function isStrings(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function slotsOf(body: unknown): Slots | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const timeZone: unknown = Reflect.get(body, "timeZone");
	const slots: unknown = Reflect.get(body, "slots");
	return typeof timeZone === "string" && isStrings(slots)
		? { timeZone, slots }
		: undefined;
}

// The `professional` of an answer. First use: bookedOf; second: cancelledOf.
function professionalOf(body: object): Professional | undefined {
	const professional: unknown = Reflect.get(body, "professional");
	if (typeof professional !== "object" || professional === null) {
		return undefined;
	}
	const id: unknown = Reflect.get(professional, "id");
	const name: unknown = Reflect.get(professional, "name");
	return typeof id === "number" && typeof name === "string"
		? { id, name }
		: undefined;
}

function bookedOf(body: unknown): Booked | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const bookingCode: unknown = Reflect.get(body, "bookingCode");
	const startsAt: unknown = Reflect.get(body, "startsAt");
	const clientPhone: unknown = Reflect.get(body, "clientPhone");
	const professional = professionalOf(body);
	return typeof bookingCode === "string" &&
		typeof startsAt === "string" &&
		typeof clientPhone === "string" &&
		professional
		? { bookingCode, startsAt, clientPhone, professional }
		: undefined;
}

function cancelledOf(body: unknown): Cancelled | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const startsAt: unknown = Reflect.get(body, "startsAt");
	const timeZone: unknown = Reflect.get(body, "timeZone");
	const professional = professionalOf(body);
	return typeof startsAt === "string" &&
		typeof timeZone === "string" &&
		professional
		? { startsAt, timeZone, professional }
		: undefined;
}

export function fetchSlots(
	professionalId: number,
): Promise<Result<Slots, SlotsError>> {
	return request<Slots, NotFound>(
		`/api/professionals/${professionalId}/slots`,
		{},
		slotsOf,
		{ 404: { code: "ProfessionalNotFound" } },
	);
}

// The client checks name and phone with the same use cases before sending,
// so a 400 would mean the server cannot be relied on: it reads as
// ServerUnreachable, as in weeklyHours/api.ts.
export function postAppointment(
	body: BookingBody,
): Promise<Result<Booked, BookError>> {
	return request<Booked, NotFound | NotFree>(
		"/api/appointments",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
		bookedOf,
		{ 404: { code: "ProfessionalNotFound" }, 409: { code: "SlotTaken" } },
	);
}

// Phone and code travel in the body, never in the path, so they stay out of
// access logs. The client always sends two strings, so a 400 would mean the
// server cannot be relied on: it reads as ServerUnreachable.
export function postCancellation(body: {
	clientPhone: string;
	bookingCode: string;
}): Promise<Result<Cancelled, CancelError>> {
	return request<Cancelled, NotBooked | TooLate>(
		"/api/appointments/cancel",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
		cancelledOf,
		{
			404: { code: "AppointmentNotFound" },
			409: { code: "CancellationTooLate" },
		},
	);
}
