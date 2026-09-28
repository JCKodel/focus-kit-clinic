import { err, ok, type Result } from "./result.ts";

export type ServerUnreachable = { code: "ServerUnreachable" };

const unreachable: ServerUnreachable = { code: "ServerUnreachable" };

// The client side of every route: a network failure, a non-2xx status not
// named in `refusals`, or a body `read` does not accept (undefined) means the
// server cannot be relied on. A 204 has no body, so `read` gets undefined.
// First use: health/api.ts (`skeleton`); second use: clinic/api.ts.
export async function request<T, E = never>(
	path: string,
	init: RequestInit,
	read: (body: unknown) => T | undefined,
	refusals: Partial<Record<number, E>> = {},
): Promise<Result<T, E | ServerUnreachable>> {
	try {
		const response = await fetch(path, init);
		const refusal = refusals[response.status];
		if (refusal !== undefined) return err(refusal);
		if (!response.ok) return err(unreachable);
		const body: unknown =
			response.status === 204 ? undefined : await response.json();
		const value = read(body);
		return value === undefined ? err(unreachable) : ok(value);
	} catch {
		return err(unreachable);
	}
}

// The string at `key` of a JSON object, or undefined.
export function stringField(body: unknown, key: string): string | undefined {
	if (typeof body !== "object" || body === null || !(key in body)) {
		return undefined;
	}
	const value: unknown = Reflect.get(body, key);
	return typeof value === "string" ? value : undefined;
}
