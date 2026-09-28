import {
	request,
	type ServerUnreachable,
	stringField,
} from "../../lib/request.ts";
import type { Result } from "../../lib/result.ts";

export type SignInError = { code: "SignInRefused" } | ServerUnreachable;
export type SessionError = { code: "NotSignedIn" } | ServerUnreachable;

function emailOf(body: unknown): string | undefined {
	return stringField(body, "email");
}

export function fetchSession(): Promise<Result<string, SessionError>> {
	return request("/api/owner/session", {}, emailOf, {
		401: { code: "NotSignedIn" },
	});
}

export function signIn(
	email: string,
	password: string,
): Promise<Result<string, SignInError>> {
	return request(
		"/api/owner/sign-in",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		},
		emailOf,
		{ 401: { code: "SignInRefused" } },
	);
}

// The answer is a 204 without a body; `true` stands for "signed out".
export function signOut(): Promise<Result<true, ServerUnreachable>> {
	return request("/api/owner/sign-out", { method: "POST" }, () => true);
}
