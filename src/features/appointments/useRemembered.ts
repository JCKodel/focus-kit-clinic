import { useCallback, useEffect, useState } from "react";
import { onRememberedChange } from "./remembered.ts";
import {
	ask as askEvent,
	confirm as confirmEvent,
	confirmStarted,
	initialRememberedState,
	keep as keepEvent,
	linesOf,
	type RememberedAppointment,
	reread,
} from "./rememberedEvents.ts";

export type { RememberedLine } from "./rememberedEvents.ts";

// "Your appointments": the remembered appointments still to come, read at
// start and after each change, and the cancellation of each. The events live
// in rememberedEvents.ts.
export function useRemembered() {
	const [state, setState] = useState(() => initialRememberedState(new Date()));

	useEffect(
		() => onRememberedChange(() => setState((s) => reread(s, new Date()))),
		[],
	);

	const ask = useCallback(
		(code: string) => setState((s) => askEvent(s, code)),
		[],
	);

	const keep = useCallback(
		(code: string) => setState((s) => keepEvent(s, code)),
		[],
	);

	const confirm = useCallback(async (appointment: RememberedAppointment) => {
		setState((s) => confirmStarted(s, appointment.bookingCode));
		setState(await confirmEvent(appointment, new Date()));
	}, []);

	return {
		lines: linesOf(state, new Date()),
		message: state.message,
		ask,
		keep,
		confirm,
	};
}
