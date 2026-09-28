import { err, ok, type Result } from "../../lib/result.ts";

export type ServerUnreachable = { code: "ServerUnreachable" };

// A non-2xx answer, an unexpected body or a network failure all mean the
// server cannot be relied on.
export async function fetchHealth(): Promise<Result<"ok", ServerUnreachable>> {
	try {
		const response = await fetch("/api/health");
		if (!response.ok) return err({ code: "ServerUnreachable" });
		const body: unknown = await response.json();
		const isOk =
			typeof body === "object" &&
			body !== null &&
			"status" in body &&
			body.status === "ok";
		return isOk ? ok("ok") : err({ code: "ServerUnreachable" });
	} catch {
		return err({ code: "ServerUnreachable" });
	}
}
