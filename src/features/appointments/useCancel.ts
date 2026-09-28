import { useCallback, useState } from "react";
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

const closed: CancelState = { open: false, phone: "", code: "", busy: false };

// "Cancel with a booking code": the typed path. What was typed is sent as it
// is; the server reads it.
export function useCancel() {
	const [state, setState] = useState<CancelState>(closed);

	const open = useCallback(() => {
		setState({ ...closed, open: true });
	}, []);

	// Back and Done both put the button back, with the fields empty.
	const close = useCallback(() => {
		setState(closed);
	}, []);

	const typePhone = useCallback((phone: string) => {
		setState((s) => ({ ...s, phone }));
	}, []);

	const typeCode = useCallback((code: string) => {
		setState((s) => ({ ...s, code }));
	}, []);

	// Also what "Try again" repeats.
	const submit = useCallback(async () => {
		const { phone, code } = state;
		setState((s) => ({ ...s, busy: true, message: undefined }));
		const result = await postCancellation({
			clientPhone: phone,
			bookingCode: code,
		});
		if (!result.ok) {
			setState((s) => ({ ...s, busy: false, message: result.error.code }));
			return;
		}
		// The phone forgets it when it remembered it; a storage failure is
		// ignored, as in remember.
		const known = normalizeBookingCode(code);
		if (known.ok) forget(known.value, new Date());
		setState({ ...closed, open: true, cancelled: result.value });
	}, [state]);

	return { state, open, close, typePhone, typeCode, submit };
}
