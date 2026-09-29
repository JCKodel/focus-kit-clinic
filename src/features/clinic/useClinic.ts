import { useEffect, useState } from "react";
import { type ClinicState, initialClinicState, load } from "./clinicEvents.ts";

// The events live in clinicEvents.ts.
export function useClinic(): ClinicState {
	const [state, setState] = useState<ClinicState>(initialClinicState);

	useEffect(() => {
		let active = true;
		load().then((update) => {
			if (active) setState(update);
		});
		return () => {
			active = false;
		};
	}, []);

	return state;
}
