import { useCallback, useEffect, useState } from "react";
import {
	checkSession,
	initialOwnerState,
	type OwnerState,
	submitSignIn as submitSignInEvent,
	submitSignInStarted,
	submitSignOut as submitSignOutEvent,
	submitSignOutStarted,
} from "./ownerEvents.ts";

export type { OwnerError } from "./ownerEvents.ts";

// The events live in ownerEvents.ts.
export function useOwner() {
	const [state, setState] = useState<OwnerState>(initialOwnerState);

	useEffect(() => {
		let active = true;
		checkSession().then((update) => {
			if (active) setState(update);
		});
		return () => {
			active = false;
		};
	}, []);

	const submitSignIn = useCallback(async (email: string, password: string) => {
		setState(submitSignInStarted());
		setState(await submitSignInEvent(email, password));
	}, []);

	const submitSignOut = useCallback(async (email: string) => {
		setState(submitSignOutStarted(email));
		setState(await submitSignOutEvent(email));
	}, []);

	return { state, signIn: submitSignIn, signOut: submitSignOut };
}
