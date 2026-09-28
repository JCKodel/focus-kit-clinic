import { useCallback, useEffect, useState } from "react";
import { type Cancelled, postCancellation } from "./api.ts";
import {
	forget,
	onRememberedChange,
	type RememberedAppointment,
	readRemembered,
} from "./remembered.ts";
import { cancel } from "./rules.ts";

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

// "Your appointments": the remembered appointments still to come, read at
// start and after each change, and the cancellation of each.
export function useRemembered() {
	const [appointments, setAppointments] = useState(() =>
		readRemembered(new Date()),
	);
	const [states, setStates] = useState<Record<string, LineState>>({});
	// Cancelled here, so they leave the list even if storage failed to forget.
	const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
	const [message, setMessage] = useState<SectionMessage>();

	useEffect(
		() => onRememberedChange(() => setAppointments(readRemembered(new Date()))),
		[],
	);

	const setState = useCallback((code: string, state?: LineState) => {
		setStates((s) => {
			const { [code]: _, ...others } = s;
			return state ? { ...others, [code]: state } : others;
		});
	}, []);

	const ask = useCallback(
		(code: string) => setState(code, "confirm"),
		[setState],
	);

	const keep = useCallback((code: string) => setState(code), [setState]);

	// Also what "Try again" repeats.
	const confirm = useCallback(
		async (appointment: RememberedAppointment) => {
			const { bookingCode, clientPhone } = appointment;
			setState(bookingCode, "busy");
			const result = await postCancellation({ clientPhone, bookingCode });
			if (!result.ok && result.error.code === "CancellationTooLate") {
				return setState(bookingCode, "tooLate");
			}
			if (!result.ok && result.error.code === "ServerUnreachable") {
				return setState(bookingCode, "failed");
			}
			// Cancelled, or no longer booked: either way the phone forgets it. A
			// storage failure is ignored, as in remember.
			forget(bookingCode, new Date());
			setGone((g) => new Set(g).add(bookingCode));
			setState(bookingCode);
			setMessage(
				result.ok
					? { kind: "cancelled", cancelled: result.value }
					: { kind: "notBooked" },
			);
		},
		[setState],
	);

	const now = new Date();
	const lines: RememberedLine[] = appointments
		.filter((a) => !gone.has(a.bookingCode))
		.map((appointment) => ({
			appointment,
			cancellable: cancel(appointment.startsAt, now).ok,
			state: states[appointment.bookingCode],
		}));

	return { lines, message, ask, keep, confirm };
}
