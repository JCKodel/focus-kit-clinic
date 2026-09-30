import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type BookingNext,
	type BookingOutcome,
	type BookingState,
	back as backEvent,
	daysOf,
	done as doneEvent,
	initialBookingState,
	loadProfessionals,
	loadProfessionalsStarted,
	loadSlots,
	loadSlotsStarted,
	type Professional,
	pickDay as pickDayEvent,
	pickTime as pickTimeEvent,
	retryOf,
	submit as submitEvent,
	submitStarted,
	tooLateToCancel,
	typeName as typeNameEvent,
	typePhone as typePhoneEvent,
} from "./bookingEvents.ts";

export type { BookingError } from "./bookingEvents.ts";

// The events live in bookingEvents.ts; the hook holds the state and
// publishes each event's in-flight state and answer.
export function useBooking() {
	const [state, setState] = useState<BookingState>(initialBookingState);
	// Only the answer to the latest request is shown; Back or another tap
	// makes earlier ones stale.
	const latest = useRef(0);

	// Any event with a call: its in-flight state, then its answer, which is
	// an update or the next event to run.
	const run = useCallback(async function run(next: BookingNext) {
		let outcome: Promise<BookingOutcome>;
		if (next.next === "submit") {
			const started = submitStarted(next.state);
			setState(started.update);
			if (!started.send) return;
			outcome = submitEvent(next.state, new Date());
		} else if (next.next === "loadSlots") {
			setState((s) => loadSlotsStarted(s, next.professional));
			outcome = loadSlots(next.professional, next.after);
		} else {
			setState((s) => loadProfessionalsStarted(s, next.message));
			outcome = loadProfessionals();
		}
		const call = ++latest.current;
		const answer = await outcome;
		if (call !== latest.current) return;
		if ("update" in answer) setState(answer.update);
		else await run(answer);
	}, []);

	useEffect(() => {
		run({ next: "loadProfessionals" });
	}, [run]);

	const pickProfessional = useCallback(
		(professional: Professional) => {
			run({ next: "loadSlots", professional });
		},
		[run],
	);

	const pickDay = useCallback((date: string) => {
		setState((s) => pickDayEvent(s, date));
	}, []);

	const pickTime = useCallback((startsAt: string) => {
		setState((s) => pickTimeEvent(s, startsAt));
	}, []);

	const back = useCallback(() => {
		latest.current++;
		setState(backEvent);
	}, []);

	const typeName = useCallback((name: string) => {
		setState((s) => typeNameEvent(s, name));
	}, []);

	const typePhone = useCallback((phone: string) => {
		setState((s) => typePhoneEvent(s, phone));
	}, []);

	const submit = useCallback(
		() => run({ next: "submit", state }),
		[state, run],
	);

	const retry = useCallback(() => {
		const next = retryOf(state);
		if (next) run(next);
	}, [state, run]);

	const done = useCallback(() => {
		setState(doneEvent);
	}, []);

	const days = useMemo(() => daysOf(state.slots), [state.slots]);

	return {
		state,
		days,
		tooLateToCancel: tooLateToCancel(state, new Date()),
		pickProfessional,
		pickDay,
		pickTime,
		back,
		typeName,
		typePhone,
		submit,
		retry,
		done,
	};
}
