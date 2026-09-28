import {
	request,
	type ServerUnreachable,
	stringField,
} from "../../lib/request.ts";
import type { Result } from "../../lib/result.ts";

export function fetchHealth(): Promise<Result<"ok", ServerUnreachable>> {
	return request("/api/health", {}, (body) =>
		stringField(body, "status") === "ok" ? "ok" : undefined,
	);
}
