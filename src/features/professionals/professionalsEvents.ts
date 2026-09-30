import type { WeeklyHoursReport } from "../weeklyHours/weeklyHoursEvents.ts";
import {
	deleteProfessional,
	fetchProfessionals,
	patchProfessional,
	postProfessional,
} from "./api.ts";
import { type NameRefusal, type Professional, sortByName } from "./rules.ts";

export type { Professional };

// Shown above the list.
export type ListError =
	| "ProfessionalNotFound"
	| "NotSignedIn"
	| "ServerUnreachable";

export type ProfessionalsError = ListError | NameRefusal;

// At most one row is open: to edit its hours, to rename, or to confirm a
// removal.
export type OpenRow =
	| { id: number; mode: "hours" }
	| { id: number; mode: "rename"; name: string; error?: NameRefusal }
	| { id: number; mode: "remove" };

export type ProfessionalsState = {
	loading: boolean;
	// undefined while loading, or when the first load failed
	list?: Professional[];
	busy: boolean;
	error?: ListError;
	addName: string;
	addError?: NameRefusal;
	row?: OpenRow;
};

export const initialProfessionalsState: ProfessionalsState = {
	loading: true,
	busy: false,
	addName: "",
};

export type ProfessionalsRepositories = {
	fetchProfessionals: typeof fetchProfessionals;
	postProfessional: typeof postProfessional;
	patchProfessional: typeof patchProfessional;
	deleteProfessional: typeof deleteProfessional;
};

export const professionalsRepositories: ProfessionalsRepositories = {
	fetchProfessionals,
	postProfessional,
	patchProfessional,
	deleteProfessional,
};

type Update = (current: ProfessionalsState) => ProfessionalsState;

function isNameRefusal(code: string): code is NameRefusal {
	return code === "InvalidProfessionalName" || code === "ProfessionalNameTaken";
}

export async function load(
	repositories = professionalsRepositories,
): Promise<Update> {
	const result = await repositories.fetchProfessionals();
	return (s) =>
		result.ok
			? { ...s, loading: false, list: result.value }
			: { ...s, loading: false, error: "ServerUnreachable" };
}

// Every action starts here: its buttons disabled, old messages cleared.
function started(state: ProfessionalsState): ProfessionalsState {
	return { ...state, busy: true, error: undefined };
}

// The professional was removed meanwhile: say so and show the list anew.
async function reloadGone(
	repositories: ProfessionalsRepositories,
): Promise<Update> {
	const result = await repositories.fetchProfessionals();
	return (s) => ({
		...s,
		busy: false,
		row: undefined,
		error: "ProfessionalNotFound",
		list: result.ok ? result.value : s.list,
	});
}

export function typeAddName(
	state: ProfessionalsState,
	addName: string,
): ProfessionalsState {
	return { ...state, addName };
}

export function addStarted(state: ProfessionalsState): ProfessionalsState {
	return { ...started(state), addError: undefined };
}

export async function add(
	name: string,
	repositories = professionalsRepositories,
): Promise<Update> {
	const result = await repositories.postProfessional(name);
	return (s) => {
		if (result.ok) {
			const list = sortByName([...(s.list ?? []), result.value]);
			return { ...s, busy: false, addName: "", list };
		}
		const code = result.error.code;
		return isNameRefusal(code)
			? { ...s, busy: false, addError: code }
			: { ...s, busy: false, error: code };
	};
}

export function openRename(
	state: ProfessionalsState,
	professional: Professional,
): ProfessionalsState {
	return {
		...state,
		error: undefined,
		row: { id: professional.id, mode: "rename", name: professional.name },
	};
}

export function typeRename(
	state: ProfessionalsState,
	name: string,
): ProfessionalsState {
	return state.row?.mode === "rename"
		? { ...state, row: { ...state.row, name } }
		: state;
}

export function renameStarted(state: ProfessionalsState): ProfessionalsState {
	return started(state);
}

export async function rename(
	id: number,
	name: string,
	repositories = professionalsRepositories,
): Promise<Update> {
	const result = await repositories.patchProfessional(id, name);
	if (!result.ok && result.error.code === "ProfessionalNotFound") {
		return reloadGone(repositories);
	}
	return (s) => {
		if (result.ok) {
			const renamed = result.value;
			const list = sortByName(
				(s.list ?? []).map((p) => (p.id === renamed.id ? renamed : p)),
			);
			return { ...s, busy: false, row: undefined, list };
		}
		const code = result.error.code;
		if (isNameRefusal(code) && s.row?.mode === "rename") {
			return { ...s, busy: false, row: { ...s.row, error: code } };
		}
		return isNameRefusal(code)
			? { ...s, busy: false }
			: { ...s, busy: false, error: code };
	};
}

export function openRemove(
	state: ProfessionalsState,
	professional: Professional,
): ProfessionalsState {
	return {
		...state,
		error: undefined,
		row: { id: professional.id, mode: "remove" },
	};
}

export function removeStarted(state: ProfessionalsState): ProfessionalsState {
	return started(state);
}

export async function remove(
	id: number,
	repositories = professionalsRepositories,
): Promise<Update> {
	const result = await repositories.deleteProfessional(id);
	if (!result.ok && result.error.code === "ProfessionalNotFound") {
		return reloadGone(repositories);
	}
	return (s) => {
		if (result.ok) {
			const list = (s.list ?? []).filter((p) => p.id !== id);
			return { ...s, busy: false, row: undefined, list };
		}
		return { ...s, busy: false, error: result.error.code };
	};
}

// Cancel and Keep: the row shows its name again, unchanged.
export function close(state: ProfessionalsState): ProfessionalsState {
	return { ...state, error: undefined, row: undefined };
}

export function openHours(
	state: ProfessionalsState,
	professional: Professional,
): ProfessionalsState {
	return {
		...state,
		error: undefined,
		row: { id: professional.id, mode: "hours" },
	};
}

// The hours editor fetches and saves on its own, and reports here. The
// answer is an update at once, so Save disables in the same render, except
// for a removed professional, which waits for the list's reload.
export function hoursReported(
	report: WeeklyHoursReport,
	repositories = professionalsRepositories,
): Update | Promise<Update> {
	if (report === "saving") return started;
	if (report === "saved") return (s) => ({ ...s, busy: false, row: undefined });
	if (report === "failed") return (s) => ({ ...s, busy: false });
	if (report === "ProfessionalNotFound") return reloadGone(repositories);
	return (s) => ({ ...s, busy: false, error: report });
}
