import { useEffect, useState } from "react";
import { fetchClinicName } from "./api.ts";

export type ClinicState =
	| { kind: "loading" }
	| { kind: "ready"; name: string }
	| { kind: "notSetUp" }
	| { kind: "unreachable" };

export function useClinic(): ClinicState {
	const [state, setState] = useState<ClinicState>({ kind: "loading" });

	useEffect(() => {
		let active = true;
		fetchClinicName().then((result) => {
			if (!active) return;
			if (result.ok) setState({ kind: "ready", name: result.value });
			else if (result.error.code === "ClinicNotSetUp") {
				setState({ kind: "notSetUp" });
			} else setState({ kind: "unreachable" });
		});
		return () => {
			active = false;
		};
	}, []);

	return state;
}
