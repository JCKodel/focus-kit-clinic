import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const initial: BookingState = {
	step: { kind: "professionals" },
	loading: true,
	name: "",
	phone: "",
	busy: false,
};

// The free slots grouped by clinic date, earliest first, as the server
// answers them in order.
function daysOf(slots: Slots | undefined): Day[] {
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

export function useBooking() {
	const [state, setState] = useState<BookingState>(initial);
	// Only the answer to the latest request is shown; Back or another tap
	// makes earlier ones stale.
	const latest = useRef(0);

	const loadProfessionals = useCallback(async (message?: StepMessage) => {
		const call = ++latest.current;
		setState((s) => ({
			...s,
			step: { kind: "professionals" },
			loading: true,
			message,
			failed: undefined,
		}));
		const result = await fetchProfessionals();
		if (call !== latest.current) return;
		setState((s) =>
			result.ok
				? { ...s, loading: false, busy: false, professionals: result.value }
				: { ...s, loading: false, busy: false, failed: "professionals" },
		);
	}, []);

	useEffect(() => {
		loadProfessionals();
	}, [loadProfessionals]);

	// Shows the days of `professional`, or, after a refused booking, the times
	// of `date` when some are left.
	const loadSlots = useCallback(
		async (
			professional: Professional,
			after?: { message: StepMessage; date: string },
		) => {
			const call = ++latest.current;
			setState((s) => ({
				...s,
				step: { kind: "days", professional },
				loading: true,
				slots: undefined,
				message: undefined,
				failed: undefined,
			}));
			const result = await fetchSlots(professional.id);
			if (call !== latest.current) return;
			if (!result.ok && result.error.code === "ProfessionalNotFound") {
				return loadProfessionals("ProfessionalNotFound");
			}
			if (!result.ok) {
				setState((s) => ({
					...s,
					loading: false,
					busy: false,
					failed: "slots",
				}));
				return;
			}
			const slots = result.value;
			const left =
				after !== undefined &&
				daysOf(slots).some((day) => day.date === after.date);
			setState((s) => ({
				...s,
				step:
					left && after
						? { kind: "times", professional, date: after.date }
						: { kind: "days", professional },
				loading: false,
				busy: false,
				slots,
				message: after?.message,
			}));
		},
		[loadProfessionals],
	);

	const pickProfessional = useCallback(
		(professional: Professional) => {
			loadSlots(professional);
		},
		[loadSlots],
	);

	const pickDay = useCallback((date: string) => {
		setState((s) =>
			s.step.kind === "days"
				? {
						...s,
						step: { kind: "times", professional: s.step.professional, date },
						message: undefined,
					}
				: s,
		);
	}, []);

	const pickTime = useCallback((startsAt: string) => {
		setState((s) =>
			s.step.kind === "times"
				? {
						...s,
						step: { ...s.step, kind: "form", startsAt },
						message: undefined,
						nameError: undefined,
						phoneError: undefined,
					}
				: s,
		);
	}, []);

	// From the times to the days, from the form to the times, and from the
	// days to the professionals.
	const back = useCallback(() => {
		latest.current++;
		setState((s) => {
			const cleared = {
				...s,
				loading: false,
				message: undefined,
				failed: undefined,
			};
			switch (s.step.kind) {
				case "days":
					return { ...cleared, step: { kind: "professionals" } };
				case "times":
					return {
						...cleared,
						step: { kind: "days", professional: s.step.professional },
					};
				case "form":
					return {
						...cleared,
						step: {
							kind: "times",
							professional: s.step.professional,
							date: s.step.date,
						},
					};
				default:
					return s;
			}
		});
	}, []);

	const typeName = useCallback((name: string) => {
		setState((s) => ({ ...s, name }));
	}, []);

	const typePhone = useCallback((phone: string) => {
		setState((s) => ({ ...s, phone }));
	}, []);

	// Name and phone are checked here to show the message beside the field
	// and send nothing; the server checks them again.
	const submit = useCallback(async () => {
		const { step, slots } = state;
		if (step.kind !== "form" || !slots) return;
		const name = checkClientName(state.name);
		const phone = checkClientPhone(state.phone);
		setState((s) => ({
			...s,
			nameError: name.ok ? undefined : name.error,
			phoneError: phone.ok ? undefined : phone.error,
		}));
		if (!name.ok || !phone.ok) return;

		setState((s) => ({ ...s, busy: true, failed: undefined }));
		const call = ++latest.current;
		const result = await postAppointment({
			professionalId: step.professional.id,
			startsAt: step.startsAt,
			clientName: state.name,
			clientPhone: state.phone,
		});
		if (call !== latest.current) return;
		if (result.ok) {
			const booked = result.value;
			// A storage failure leaves the code on screen: nothing else to do.
			remember(
				{
					bookingCode: booked.bookingCode,
					clientPhone: booked.clientPhone,
					professionalName: booked.professional.name,
					startsAt: booked.startsAt,
					timeZone: slots.timeZone,
				},
				new Date(),
			);
			setState((s) => ({
				...s,
				step: { kind: "booked", booked, timeZone: slots.timeZone },
				busy: false,
				name: "",
				phone: "",
			}));
			return;
		}
		const code = result.error.code;
		if (code === "ProfessionalNotFound") {
			return loadProfessionals("ProfessionalNotFound");
		}
		if (code === "SlotTaken") {
			return loadSlots(step.professional, {
				message: "SlotTaken",
				date: step.date,
			});
		}
		setState((s) => ({ ...s, busy: false, failed: "book" }));
	}, [state, loadProfessionals, loadSlots]);

	const retry = useCallback(() => {
		const { failed, step } = state;
		if (failed === "professionals") loadProfessionals();
		else if (failed === "slots" && step.kind === "days") {
			loadSlots(step.professional);
		} else if (failed === "book") submit();
	}, [state, loadProfessionals, loadSlots, submit]);

	const done = useCallback(() => {
		setState((s) => ({ ...s, step: { kind: "professionals" } }));
	}, []);

	const days = useMemo(() => daysOf(state.slots), [state.slots]);

	// Display only: the server does not refuse such a booking.
	const tooLateToCancel =
		state.step.kind === "form" &&
		cancellationDeadline(state.step.startsAt).getTime() < Date.now();

	return {
		state,
		days,
		tooLateToCancel,
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
