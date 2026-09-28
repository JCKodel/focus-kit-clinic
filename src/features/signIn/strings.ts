import type { OwnerError } from "./useOwner.ts";

export const strings = {
	checking: "Checking your session",
	heading: "Owner sign-in",
	signedInHeading: "Owner",
	email: "Email",
	password: "Password",
	signIn: "Sign in",
	signingIn: "Signing in",
	signOut: "Sign out",
	signedInAs: (email: string) => `Signed in as ${email}`,
};

export const errorStrings: Record<OwnerError, string> = {
	SignInRefused: "Wrong email or password.",
	ServerUnreachable: "The server cannot be reached. Try again.",
};
