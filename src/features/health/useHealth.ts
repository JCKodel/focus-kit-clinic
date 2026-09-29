import { useEffect, useState } from "react";
import { check, type HealthState, initialHealthState } from "./healthEvents.ts";

export type { HealthState } from "./healthEvents.ts";

// The events live in healthEvents.ts.
export function useHealth(): HealthState {
	const [state, setState] = useState<HealthState>(initialHealthState);

	useEffect(() => {
		let active = true;
		check().then((update) => {
			if (active) setState(update);
		});
		return () => {
			active = false;
		};
	}, []);

	return state;
}
