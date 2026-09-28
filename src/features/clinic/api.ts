import {
	request,
	type ServerUnreachable,
	stringField,
} from "../../lib/request.ts";
import type { Result } from "../../lib/result.ts";

export type ClinicError = { code: "ClinicNotSetUp" } | ServerUnreachable;

export function fetchClinicName(): Promise<Result<string, ClinicError>> {
	return request("/api/clinic", {}, (body) => stringField(body, "name"), {
		404: { code: "ClinicNotSetUp" },
	});
}
