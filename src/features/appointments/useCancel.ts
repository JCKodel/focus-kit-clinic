import { useCallback, useState } from "react";
import {
	type CancelState,
	close as closeEvent,
	initialCancelState,
	open as openEvent,
	submit as submitEvent,
	submitStarted,
	typeCode as typeCodeEvent,
	typePhone as typePhoneEvent,
} from "./cancelEvents.ts";

// "Cancel with a booking code": the typed path. The events live in
// cancelEvents.ts.
export function useCancel() {
	const [state, setState] = useState<CancelState>(initialCancelState);

	const open = useCallback(() => {
		setState(openEvent());
	}, []);

	const close = useCallback(() => {
		setState(closeEvent());
	}, []);

	const typePhone = useCallback((phone: string) => {
		setState((s) => typePhoneEvent(s, phone));
	}, []);

	const typeCode = useCallback((code: string) => {
		setState((s) => typeCodeEvent(s, code));
	}, []);

	const submit = useCallback(async () => {
		setState(submitStarted);
		setState(await submitEvent(state.phone, state.code, new Date()));
	}, [state]);

	return { state, open, close, typePhone, typeCode, submit };
}
