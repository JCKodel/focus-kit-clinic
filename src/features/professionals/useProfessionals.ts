import { useCallback, useEffect, useState } from "react";
import {
	deleteProfessional,
	fetchProfessionals,
	patchProfessional,
	postProfessional,
} from "./api.ts";
import { type NameRefusal, type Professional, sortByName } from "./rules.ts";

// Shown above the list.
export type ListError =
	| "ProfessionalNotFound"
	| "NotSignedIn"
	| "ServerUnreachable";

export type ProfessionalsError = ListError | NameRefusal;

// At most one row is open, to rename or to confirm a removal.
export type OpenRow =
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

const initial: ProfessionalsState = { loading: true, busy: false, addName: "" };

function isNameRefusal(code: string): code is NameRefusal {
	return code === "InvalidProfessionalName" || code === "ProfessionalNameTaken";
}

export function useProfessionals() {
	const [state, setState] = useState<ProfessionalsState>(initial);

	useEffect(() => {
		let active = true;
		fetchProfessionals().then((result) => {
			if (!active) return;
			setState((s) =>
				result.ok
					? { ...s, loading: false, list: result.value }
					: { ...s, loading: false, error: "ServerUnreachable" },
			);
		});
		return () => {
			active = false;
		};
	}, []);

	// Every action starts here: its buttons disabled, old messages cleared.
	const start = useCallback(() => {
		setState((s) => ({ ...s, busy: true, error: undefined }));
	}, []);

	// The professional was removed meanwhile: say so and show the list anew.
	const reloadGone = useCallback(async () => {
		const result = await fetchProfessionals();
		setState((s) => ({
			...s,
			busy: false,
			row: undefined,
			error: "ProfessionalNotFound",
			list: result.ok ? result.value : s.list,
		}));
	}, []);

	const typeAddName = useCallback((addName: string) => {
		setState((s) => ({ ...s, addName }));
	}, []);

	const add = useCallback(
		async (name: string) => {
			start();
			setState((s) => ({ ...s, addError: undefined }));
			const result = await postProfessional(name);
			setState((s) => {
				if (result.ok) {
					const list = sortByName([...(s.list ?? []), result.value]);
					return { ...s, busy: false, addName: "", list };
				}
				const code = result.error.code;
				return isNameRefusal(code)
					? { ...s, busy: false, addError: code }
					: { ...s, busy: false, error: code };
			});
		},
		[start],
	);

	const openRename = useCallback((professional: Professional) => {
		setState((s) => ({
			...s,
			error: undefined,
			row: { id: professional.id, mode: "rename", name: professional.name },
		}));
	}, []);

	const typeRename = useCallback((name: string) => {
		setState((s) =>
			s.row?.mode === "rename" ? { ...s, row: { ...s.row, name } } : s,
		);
	}, []);

	const save = useCallback(
		async (id: number, name: string) => {
			start();
			const result = await patchProfessional(id, name);
			if (!result.ok && result.error.code === "ProfessionalNotFound") {
				return reloadGone();
			}
			setState((s) => {
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
			});
		},
		[start, reloadGone],
	);

	const openRemove = useCallback((professional: Professional) => {
		setState((s) => ({
			...s,
			error: undefined,
			row: { id: professional.id, mode: "remove" },
		}));
	}, []);

	const remove = useCallback(
		async (id: number) => {
			start();
			const result = await deleteProfessional(id);
			if (!result.ok && result.error.code === "ProfessionalNotFound") {
				return reloadGone();
			}
			setState((s) => {
				if (result.ok) {
					const list = (s.list ?? []).filter((p) => p.id !== id);
					return { ...s, busy: false, row: undefined, list };
				}
				return { ...s, busy: false, error: result.error.code };
			});
		},
		[start, reloadGone],
	);

	// Cancel and Keep: the row shows its name again, unchanged.
	const close = useCallback(() => {
		setState((s) => ({ ...s, error: undefined, row: undefined }));
	}, []);

	return {
		state,
		typeAddName,
		add,
		openRename,
		typeRename,
		save,
		openRemove,
		remove,
		close,
	};
}
