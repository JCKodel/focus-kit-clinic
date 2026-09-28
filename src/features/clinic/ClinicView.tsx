import { strings } from "./strings.ts";
import { useClinic } from "./useClinic.ts";

// The home heading: the clinic's name, or "Clinic" until it is known.
export function ClinicView() {
	const state = useClinic();
	return (
		<>
			<h1>{state.kind === "ready" ? state.name : strings.defaultTitle}</h1>
			{state.kind === "notSetUp" && <p>{strings.notSetUp}</p>}
		</>
	);
}
