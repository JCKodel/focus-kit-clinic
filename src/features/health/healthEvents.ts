import type { Update } from "../../lib/update.ts";
import { fetchHealth } from "./api.ts";

export type HealthState = "checking" | "ok" | "unreachable";

export const initialHealthState: HealthState = "checking";

export type HealthRepositories = { fetchHealth: typeof fetchHealth };

export const healthRepositories: HealthRepositories = { fetchHealth };

export async function check(
	repositories = healthRepositories,
): Promise<Update<HealthState>> {
	const result = await repositories.fetchHealth();
	return () => (result.ok ? "ok" : "unreachable");
}
