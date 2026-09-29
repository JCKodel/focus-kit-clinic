import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../lib/result.ts";
import {
	checkSession,
	initialOwnerState,
	type OwnerRepositories,
	submitSignIn,
	submitSignInStarted,
	submitSignOut,
	submitSignOutStarted,
} from "./ownerEvents.ts";

function unexpected(): never {
	throw new Error("not called in this test");
}

function fake(repositories: Partial<OwnerRepositories>): OwnerRepositories {
	return {
		fetchSession: unexpected,
		signIn: unexpected,
		signOut: unexpected,
		...repositories,
	};
}

const unreachable = err({ code: "ServerUnreachable" } as const);
const email = "owner@clinic.test";

describe("the session check", () => {
	it("gives signedIn", async () => {
		const update = await checkSession(
			fake({ fetchSession: async () => ok(email) }),
		);

		expect(update(initialOwnerState)).toEqual({
			kind: "signedIn",
			email,
			busy: false,
		});
	});

	it("gives signedOut", async () => {
		const update = await checkSession(
			fake({
				fetchSession: async () => err({ code: "NotSignedIn" } as const),
			}),
		);

		expect(update(initialOwnerState)).toEqual({
			kind: "signedOut",
			busy: false,
		});
	});

	it("gives signedOut with ServerUnreachable", async () => {
		const update = await checkSession(
			fake({ fetchSession: async () => unreachable }),
		);

		expect(update(initialOwnerState)).toEqual({
			kind: "signedOut",
			busy: false,
			error: "ServerUnreachable",
		});
	});
});

describe("signing in", () => {
	it("is busy signed out in flight", () => {
		expect(submitSignInStarted()).toEqual({ kind: "signedOut", busy: true });
	});

	it("gives signedIn", async () => {
		const signIn = vi.fn(async () => ok(email));

		const update = await submitSignIn(email, "secret", fake({ signIn }));

		expect(signIn).toHaveBeenCalledWith(email, "secret");
		expect(update(submitSignInStarted())).toEqual({
			kind: "signedIn",
			email,
			busy: false,
		});
	});

	it.each(["SignInRefused", "ServerUnreachable"] as const)(
		"gives signedOut with %s",
		async (code) => {
			const update = await submitSignIn(
				email,
				"wrong",
				fake({ signIn: async () => err({ code }) }),
			);

			expect(update(submitSignInStarted())).toEqual({
				kind: "signedOut",
				busy: false,
				error: code,
			});
		},
	);
});

describe("signing out", () => {
	it("is busy signed in in flight", () => {
		expect(submitSignOutStarted(email)).toEqual({
			kind: "signedIn",
			email,
			busy: true,
		});
	});

	it("gives signedOut", async () => {
		const update = await submitSignOut(
			email,
			fake({ signOut: async () => ok(true as const) }),
		);

		expect(update(submitSignOutStarted(email))).toEqual({
			kind: "signedOut",
			busy: false,
		});
	});

	it("stays signed in with ServerUnreachable", async () => {
		const update = await submitSignOut(
			email,
			fake({ signOut: async () => unreachable }),
		);

		expect(update(submitSignOutStarted(email))).toEqual({
			kind: "signedIn",
			email,
			busy: false,
			error: "ServerUnreachable",
		});
	});
});
