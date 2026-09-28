import { request, type ServerUnreachable } from "../../lib/request.ts";
import type { Result } from "../../lib/result.ts";
import type { NameRefusal, Professional } from "./rules.ts";

type NotSignedIn = { code: "NotSignedIn" };
type NotFound = { code: "ProfessionalNotFound" };
type NameRefused = { code: NameRefusal };

export type AddError = NameRefused | NotSignedIn | ServerUnreachable;
export type RenameError =
	| NameRefused
	| NotFound
	| NotSignedIn
	| ServerUnreachable;
export type RemoveError = NotFound | NotSignedIn | ServerUnreachable;

function professionalOf(body: unknown): Professional | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const id: unknown = Reflect.get(body, "id");
	const name: unknown = Reflect.get(body, "name");
	return typeof id === "number" && typeof name === "string"
		? { id, name }
		: undefined;
}

function listOf(body: unknown): Professional[] | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const list: unknown = Reflect.get(body, "professionals");
	if (!Array.isArray(list)) return undefined;
	const professionals = list.map(professionalOf);
	return professionals.every((p) => p !== undefined)
		? professionals
		: undefined;
}

function withName(method: string, name: string): RequestInit {
	return {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	};
}

// The client always sends a body of the right shape, so a 400 is the name.
const nameRefusals = {
	400: { code: "InvalidProfessionalName" },
	409: { code: "ProfessionalNameTaken" },
} as const;

export function fetchProfessionals(): Promise<
	Result<Professional[], ServerUnreachable>
> {
	return request("/api/professionals", {}, listOf);
}

export function postProfessional(
	name: string,
): Promise<Result<Professional, AddError>> {
	return request<Professional, NameRefused | NotSignedIn>(
		"/api/owner/professionals",
		withName("POST", name),
		professionalOf,
		{ ...nameRefusals, 401: { code: "NotSignedIn" } },
	);
}

export function patchProfessional(
	id: number,
	name: string,
): Promise<Result<Professional, RenameError>> {
	return request<Professional, NameRefused | NotFound | NotSignedIn>(
		`/api/owner/professionals/${id}`,
		withName("PATCH", name),
		professionalOf,
		{
			...nameRefusals,
			401: { code: "NotSignedIn" },
			404: { code: "ProfessionalNotFound" },
		},
	);
}

// The answer is a 204 without a body; `true` stands for "removed".
export function deleteProfessional(
	id: number,
): Promise<Result<true, RemoveError>> {
	return request<true, NotFound | NotSignedIn>(
		`/api/owner/professionals/${id}`,
		{ method: "DELETE" },
		() => true,
		{ 401: { code: "NotSignedIn" }, 404: { code: "ProfessionalNotFound" } },
	);
}
