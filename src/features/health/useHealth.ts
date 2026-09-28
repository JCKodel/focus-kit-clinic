import { useEffect, useState } from "react";
import { fetchHealth } from "./api.ts";

export type HealthState = "checking" | "ok" | "unreachable";

export function useHealth(): HealthState {
	const [state, setState] = useState<HealthState>("checking");

	useEffect(() => {
		let active = true;
		fetchHealth().then((result) => {
			if (active) setState(result.ok ? "ok" : "unreachable");
		});
		return () => {
			active = false;
		};
	}, []);

	return state;
}
