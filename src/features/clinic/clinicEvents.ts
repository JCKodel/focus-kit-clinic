import { fetchClinicName } from "./api.ts";

export type ClinicState =
	| { kind: "loading" }
	| { kind: "ready"; name: string }
	| { kind: "notSetUp" }
	| { kind: "unreachable" };

export const initialClinicState: ClinicState = { kind: "loading" };

export type ClinicRepositories = { fetchClinicName: typeof fetchClinicName };

export const clinicRepositories: ClinicRepositories = { fetchClinicName };

export async function load(
	repositories = clinicRepositories,
): Promise<(current: ClinicState) => ClinicState> {
	const result = await repositories.fetchClinicName();
	if (result.ok) return () => ({ kind: "ready", name: result.value });
	return result.error.code === "ClinicNotSetUp"
		? () => ({ kind: "notSetUp" })
		: () => ({ kind: "unreachable" });
}
