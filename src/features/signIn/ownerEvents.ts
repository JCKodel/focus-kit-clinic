import { fetchSession, signIn, signOut } from "./api.ts";

export type OwnerError = "SignInRefused" | "ServerUnreachable";

export type OwnerState =
	| { kind: "checking" }
	| { kind: "signedOut"; busy: boolean; error?: OwnerError }
	| { kind: "signedIn"; email: string; busy: boolean; error?: OwnerError };

export const initialOwnerState: OwnerState = { kind: "checking" };

export type OwnerRepositories = {
	fetchSession: typeof fetchSession;
	signIn: typeof signIn;
	signOut: typeof signOut;
};

export const ownerRepositories: OwnerRepositories = {
	fetchSession,
	signIn,
	signOut,
};

type Update = (current: OwnerState) => OwnerState;

export async function checkSession(
	repositories = ownerRepositories,
): Promise<Update> {
	const result = await repositories.fetchSession();
	if (result.ok) {
		return () => ({ kind: "signedIn", email: result.value, busy: false });
	}
	if (result.error.code === "NotSignedIn") {
		return () => ({ kind: "signedOut", busy: false });
	}
	return () => ({ kind: "signedOut", busy: false, error: "ServerUnreachable" });
}

export function submitSignInStarted(): OwnerState {
	return { kind: "signedOut", busy: true };
}

export async function submitSignIn(
	email: string,
	password: string,
	repositories = ownerRepositories,
): Promise<Update> {
	const result = await repositories.signIn(email, password);
	return () =>
		result.ok
			? { kind: "signedIn", email: result.value, busy: false }
			: { kind: "signedOut", busy: false, error: result.error.code };
}

export function submitSignOutStarted(email: string): OwnerState {
	return { kind: "signedIn", email, busy: true };
}

export async function submitSignOut(
	email: string,
	repositories = ownerRepositories,
): Promise<Update> {
	const result = await repositories.signOut();
	return () =>
		result.ok
			? { kind: "signedOut", busy: false }
			: { kind: "signedIn", email, busy: false, error: result.error.code };
}
