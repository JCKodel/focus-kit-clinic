import type { Started, Update } from "../../lib/update.ts";
import { fetchProfessionals } from "../professionals/api.ts";
import type { Professional } from "../professionals/rules.ts";
import { type Booked, fetchSlots, postAppointment, type Slots } from "./api.ts";
import { clinicDateOf } from "./clinicTime.ts";
import { remember } from "./remembered.ts";
import {
	cancellationDeadline,
	checkClientName,
	checkClientPhone,
} from "./rules.ts";

export type { Professional };

export type BookingError =
	| "InvalidClientName"
	| "InvalidPhoneNumber"
	| "SlotTaken"
	| "ProfessionalNotFound"
	| "ServerUnreachable";

// Shown above the current step.
export type StepMessage = "SlotTaken" | "ProfessionalNotFound";

export type Step =
	| { kind: "professionals" }
	| { kind: "days"; professional: Professional }
	| { kind: "times"; professional: Professional; date: string }
	| {
			kind: "form";
			professional: Professional;
			date: string;
			startsAt: string;
	  }
	| { kind: "booked"; booked: Booked; timeZone: string };

// What "Try again" repeats.
type Failed = "professionals" | "slots" | "book";

export type BookingState = {
	step: Step;
	loading: boolean;
	// undefined while loading, or when the first load failed
	professionals?: Professional[];
	// of the professional being booked; undefined while loading
	slots?: Slots;
	message?: StepMessage;
	failed?: Failed;
	name: string;
	phone: string;
	nameError?: "InvalidClientName";
	phoneError?: "InvalidPhoneNumber";
	busy: boolean;
};

export type Day = { date: string; starts: string[] };

export const initialBookingState: BookingState = {
	step: { kind: "professionals" },
	loading: true,
	name: "",
	phone: "",
	busy: false,
};

export type BookingRepositories = {
	fetchProfessionals: typeof fetchProfessionals;
	fetchSlots: typeof fetchSlots;
	postAppointment: typeof postAppointment;
	remember: typeof remember;
};

export const bookingRepositories: BookingRepositories = {
	fetchProfessionals,
	fetchSlots,
	postAppointment,
	remember,
};

// The event the hook runs next, as it runs any event: in-flight state first.
export type BookingNext =
	| { next: "loadProfessionals"; message?: StepMessage }
	| {
			next: "loadSlots";
			professional: Professional;
			after?: { message: StepMessage; date: string };
	  }
	// the state the booking is made from
	| { next: "submit"; state: BookingState };

export type BookingOutcome = { update: Update<BookingState> } | BookingNext;

// The free slots grouped by clinic date, earliest first, as the server
// answers them in order.
export function daysOf(slots: Slots | undefined): Day[] {
	if (!slots) return [];
	const days: Day[] = [];
	for (const start of slots.slots) {
		const date = clinicDateOf(new Date(start), slots.timeZone);
		const last = days.at(-1);
		if (last?.date === date) last.starts.push(start);
		else days.push({ date, starts: [start] });
	}
	return days;
}

// Display only: the server does not refuse such a booking.
export function tooLateToCancel(state: BookingState, now: Date): boolean {
	return (
		state.step.kind === "form" &&
		cancellationDeadline(state.step.startsAt).getTime() < now.getTime()
	);
}

export function loadProfessionalsStarted(
	state: BookingState,
	message?: StepMessage,
): BookingState {
	return {
		...state,
		step: { kind: "professionals" },
		loading: true,
		message,
		failed: undefined,
	};
}

export async function loadProfessionals(
	repositories = bookingRepositories,
): Promise<BookingOutcome> {
	const result = await repositories.fetchProfessionals();
	return {
		update: (s) =>
			result.ok
				? { ...s, loading: false, busy: false, professionals: result.value }
				: { ...s, loading: false, busy: false, failed: "professionals" },
	};
}

export function loadSlotsStarted(
	state: BookingState,
	professional: Professional,
): BookingState {
	return {
		...state,
		step: { kind: "days", professional },
		loading: true,
		slots: undefined,
		message: undefined,
		failed: undefined,
	};
}

// Shows the days of `professional`, or, after a refused booking, the times
// of `date` when some are left.
export async function loadSlots(
	professional: Professional,
	after?: { message: StepMessage; date: string },
	repositories = bookingRepositories,
): Promise<BookingOutcome> {
	const result = await repositories.fetchSlots(professional.id);
	if (!result.ok && result.error.code === "ProfessionalNotFound") {
		return { next: "loadProfessionals", message: "ProfessionalNotFound" };
	}
	if (!result.ok) {
		return {
			update: (s) => ({ ...s, loading: false, busy: false, failed: "slots" }),
		};
	}
	const slots = result.value;
	const left =
		after !== undefined && daysOf(slots).some((day) => day.date === after.date);
	return {
		update: (s) => ({
			...s,
			step:
				left && after
					? { kind: "times", professional, date: after.date }
					: { kind: "days", professional },
			loading: false,
			busy: false,
			slots,
			message: after?.message,
		}),
	};
}

export function pickDay(state: BookingState, date: string): BookingState {
	return state.step.kind === "days"
		? {
				...state,
				step: { kind: "times", professional: state.step.professional, date },
				message: undefined,
			}
		: state;
}

export function pickTime(state: BookingState, startsAt: string): BookingState {
	return state.step.kind === "times"
		? {
				...state,
				step: { ...state.step, kind: "form", startsAt },
				message: undefined,
				nameError: undefined,
				phoneError: undefined,
			}
		: state;
}

// From the times to the days, from the form to the times, and from the
// days to the professionals.
export function back(state: BookingState): BookingState {
	const cleared = {
		...state,
		loading: false,
		message: undefined,
		failed: undefined,
	};
	switch (state.step.kind) {
		case "days":
			return { ...cleared, step: { kind: "professionals" } };
		case "times":
			return {
				...cleared,
				step: { kind: "days", professional: state.step.professional },
			};
		case "form":
			return {
				...cleared,
				step: {
					kind: "times",
					professional: state.step.professional,
					date: state.step.date,
				},
			};
		default:
			return state;
	}
}

export function typeName(state: BookingState, name: string): BookingState {
	return { ...state, name };
}

export function typePhone(state: BookingState, phone: string): BookingState {
	return { ...state, phone };
}

export function done(state: BookingState): BookingState {
	return { ...state, step: { kind: "professionals" } };
}

// Name and phone are checked here to show the message beside the field
// and send nothing; the server checks them again. The check reads `state`,
// the one the person acted on; `update` puts its answer on the current
// state, so what was typed meanwhile survives.
export function submitStarted(state: BookingState): Started<BookingState> {
	if (state.step.kind !== "form" || !state.slots) {
		return { update: (current) => current, send: false };
	}
	const name = checkClientName(state.name);
	const phone = checkClientPhone(state.phone);
	const errors = {
		nameError: name.ok ? undefined : name.error,
		phoneError: phone.ok ? undefined : phone.error,
	};
	if (!name.ok || !phone.ok) {
		return { update: (current) => ({ ...current, ...errors }), send: false };
	}
	return {
		update: (current) => ({
			...current,
			...errors,
			busy: true,
			failed: undefined,
		}),
		send: true,
	};
}

// `state` is the one given to `submitStarted`, the one the person acted on.
export async function submit(
	state: BookingState,
	now: Date,
	repositories = bookingRepositories,
): Promise<BookingOutcome> {
	const { step, slots } = state;
	if (step.kind !== "form" || !slots) return { update: (s) => s };
	const result = await repositories.postAppointment({
		professionalId: step.professional.id,
		startsAt: step.startsAt,
		clientName: state.name,
		clientPhone: state.phone,
	});
	if (result.ok) {
		const booked = result.value;
		// A storage failure leaves the code on screen: nothing else to do.
		repositories.remember(
			{
				bookingCode: booked.bookingCode,
				clientPhone: booked.clientPhone,
				professionalName: booked.professional.name,
				startsAt: booked.startsAt,
				timeZone: slots.timeZone,
			},
			now,
		);
		return {
			update: (s) => ({
				...s,
				step: { kind: "booked", booked, timeZone: slots.timeZone },
				busy: false,
				name: "",
				phone: "",
			}),
		};
	}
	const code = result.error.code;
	if (code === "ProfessionalNotFound") {
		return { next: "loadProfessionals", message: "ProfessionalNotFound" };
	}
	if (code === "SlotTaken") {
		return {
			next: "loadSlots",
			professional: step.professional,
			after: { message: "SlotTaken", date: step.date },
		};
	}
	return { update: (s) => ({ ...s, busy: false, failed: "book" }) };
}

// What "Try again" repeats. The slots are reloaded without the message or
// the date of a refused booking (slot-taken-retry, docs/06).
export function retryOf(state: BookingState): BookingNext | undefined {
	const { failed, step } = state;
	if (failed === "professionals") return { next: "loadProfessionals" };
	if (failed === "slots" && step.kind === "days") {
		return { next: "loadSlots", professional: step.professional };
	}
	if (failed === "book") return { next: "submit", state };
	return undefined;
}
