import { useEffect, useState } from "react";
import {
	onRememberedChange,
	type RememberedAppointment,
	readRemembered,
} from "./remembered.ts";

// The remembered appointments still to come, read at start and again after
// each booking.
export function useRemembered(): RememberedAppointment[] {
	const [appointments, setAppointments] = useState(() =>
		readRemembered(new Date()),
	);

	useEffect(
		() => onRememberedChange(() => setAppointments(readRemembered(new Date()))),
		[],
	);

	return appointments;
}
