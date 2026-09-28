import type { HealthState } from "./useHealth.ts";

export const strings: Record<HealthState, string> = {
	checking: "Checking the server",
	ok: "Server: ok",
	unreachable: "Server: unreachable",
};
