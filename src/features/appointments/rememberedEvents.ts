import type { Update } from "../../lib/update.ts";
import { type Cancelled, postCancellation } from "./api.ts";
import {
	forget,
	type RememberedAppointment,
	readRemembered,
} from "./remembered.ts";
import { cancel } from "./rules.ts";

export type { RememberedAppointment };

// Where one appointment's cancellation stands: asked to confirm, in flight,
// refused as too late by the server, or failed to reach it.
export type LineState = "confirm" | "busy" | "tooLate" | "failed";

export type RememberedLine = {
	appointment: RememberedAppointment;
	// Display only: the server enforces the same rule.
	cancellable: boolean;
	state?: LineState;
};

// Shown in the section until the page is reloaded.
export type SectionMessage =
	| { kind: "cancelled"; cancelled: Cancelled }
	| { kind: "notBooked" };

export type RememberedState = {
	appointments: RememberedAppointment[];
	// by booking code
	states: Record<string, LineState>;
	// Cancelled here, so they leave the list even if storage failed to forget.
	gone: ReadonlySet<string>;
	message?: SectionMessage;
};

export type RememberedRepositories = {
	readRemembered: typeof readRemembered;
	postCancellation: typeof postCancellation;
	forget: typeof forget;
};

export const rememberedRepositories: RememberedRepositories = {
	readRemembered,
	postCancellation,
	forget,
};

// Reading local storage does not wait, so the first state and the reread
// after a change are plain functions.
export function initialRememberedState(
	now: Date,
	repositories = rememberedRepositories,
): RememberedState {
	return {
		appointments: repositories.readRemembered(now),
		states: {},
		gone: new Set(),
	};
}

export function reread(
	state: RememberedState,
	now: Date,
	repositories = rememberedRepositories,
): RememberedState {
	return { ...state, appointments: repositories.readRemembered(now) };
}

function withLine(
	state: RememberedState,
	code: string,
	line?: LineState,
): RememberedState {
	const { [code]: _, ...others } = state.states;
	return { ...state, states: line ? { ...others, [code]: line } : others };
}

export function ask(state: RememberedState, code: string): RememberedState {
	return withLine(state, code, "confirm");
}

export function keep(state: RememberedState, code: string): RememberedState {
	return withLine(state, code);
}

export function confirmStarted(
	state: RememberedState,
	code: string,
): RememberedState {
	return withLine(state, code, "busy");
}

// Also what "Try again" repeats.
export async function confirm(
	appointment: RememberedAppointment,
	now: Date,
	repositories = rememberedRepositories,
): Promise<Update<RememberedState>> {
	const { bookingCode, clientPhone } = appointment;
	const result = await repositories.postCancellation({
		clientPhone,
		bookingCode,
	});
	if (!result.ok && result.error.code === "CancellationTooLate") {
		return (s) => withLine(s, bookingCode, "tooLate");
	}
	if (!result.ok && result.error.code === "ServerUnreachable") {
		return (s) => withLine(s, bookingCode, "failed");
	}
	// Cancelled, or no longer booked: either way the phone forgets it. A
	// storage failure is ignored, as in remember.
	repositories.forget(bookingCode, now);
	const message: SectionMessage = result.ok
		? { kind: "cancelled", cancelled: result.value }
		: { kind: "notBooked" };
	return (s) => ({
		...withLine(s, bookingCode),
		gone: new Set(s.gone).add(bookingCode),
		message,
	});
}

export function linesOf(state: RememberedState, now: Date): RememberedLine[] {
	return state.appointments
		.filter((a) => !state.gone.has(a.bookingCode))
		.map((appointment) => ({
			appointment,
			cancellable: cancel(appointment.startsAt, now).ok,
			state: state.states[appointment.bookingCode],
		}));
}
