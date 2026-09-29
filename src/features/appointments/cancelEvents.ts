import { type CancelError, type Cancelled, postCancellation } from "./api.ts";
import { forget } from "./remembered.ts";
import { normalizeBookingCode } from "./rules.ts";

export type CancelState = {
	open: boolean;
	phone: string;
	code: string;
	busy: boolean;
	// Above the form; ServerUnreachable comes with "Try again".
	message?: CancelError["code"];
	cancelled?: Cancelled;
};

export const initialCancelState: CancelState = {
	open: false,
	phone: "",
	code: "",
	busy: false,
};

export type CancelRepositories = {
	postCancellation: typeof postCancellation;
	forget: typeof forget;
};

export const cancelRepositories: CancelRepositories = {
	postCancellation,
	forget,
};

export function open(): CancelState {
	return { ...initialCancelState, open: true };
}

// Back and Done both put the button back, with the fields empty.
export function close(): CancelState {
	return initialCancelState;
}

export function typePhone(state: CancelState, phone: string): CancelState {
	return { ...state, phone };
}

export function typeCode(state: CancelState, code: string): CancelState {
	return { ...state, code };
}

export function submitStarted(state: CancelState): CancelState {
	return { ...state, busy: true, message: undefined };
}

// Also what "Try again" repeats. What was typed is sent as it is; the server
// reads it.
export async function submit(
	phone: string,
	code: string,
	now: Date,
	repositories = cancelRepositories,
): Promise<(current: CancelState) => CancelState> {
	const result = await repositories.postCancellation({
		clientPhone: phone,
		bookingCode: code,
	});
	if (!result.ok) {
		const message = result.error.code;
		return (s) => ({ ...s, busy: false, message });
	}
	// The phone forgets it when it remembered it; a storage failure is
	// ignored, as in remember.
	const known = normalizeBookingCode(code);
	if (known.ok) repositories.forget(known.value, now);
	const cancelled = result.value;
	return () => ({ ...initialCancelState, open: true, cancelled });
}
