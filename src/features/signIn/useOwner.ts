import { useCallback, useEffect, useState } from "react";
import { fetchSession, signIn, signOut } from "./api.ts";

export type OwnerError = "SignInRefused" | "ServerUnreachable";

export type OwnerState =
	| { kind: "checking" }
	| { kind: "signedOut"; busy: boolean; error?: OwnerError }
	| { kind: "signedIn"; email: string; busy: boolean; error?: OwnerError };

export function useOwner() {
	const [state, setState] = useState<OwnerState>({ kind: "checking" });

	useEffect(() => {
		let active = true;
		fetchSession().then((result) => {
			if (!active) return;
			if (result.ok) {
				setState({ kind: "signedIn", email: result.value, busy: false });
			} else if (result.error.code === "NotSignedIn") {
				setState({ kind: "signedOut", busy: false });
			} else {
				setState({
					kind: "signedOut",
					busy: false,
					error: "ServerUnreachable",
				});
			}
		});
		return () => {
			active = false;
		};
	}, []);

	const submitSignIn = useCallback(async (email: string, password: string) => {
		setState({ kind: "signedOut", busy: true });
		const result = await signIn(email, password);
		setState(
			result.ok
				? { kind: "signedIn", email: result.value, busy: false }
				: { kind: "signedOut", busy: false, error: result.error.code },
		);
	}, []);

	const submitSignOut = useCallback(async (email: string) => {
		setState({ kind: "signedIn", email, busy: true });
		const result = await signOut();
		setState(
			result.ok
				? { kind: "signedOut", busy: false }
				: { kind: "signedIn", email, busy: false, error: result.error.code },
		);
	}, []);

	return { state, signIn: submitSignIn, signOut: submitSignOut };
}
