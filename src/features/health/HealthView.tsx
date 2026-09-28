import { strings } from "./strings.ts";
import { useHealth } from "./useHealth.ts";

export function HealthView() {
	const state = useHealth();
	return <p role="status">{strings[state]}</p>;
}
