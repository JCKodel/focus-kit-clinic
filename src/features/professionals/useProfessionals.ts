import { useCallback, useEffect, useMemo, useState } from "react";
import type { HoursSection } from "../weeklyHours/useWeeklyHours.ts";
import {
	add as addEvent,
	addStarted,
	close as closeEvent,
	hoursReported,
	initialProfessionalsState,
	load,
	openHours as openHoursEvent,
	openRemove as openRemoveEvent,
	openRename as openRenameEvent,
	type Professional,
	type ProfessionalsState,
	remove as removeEvent,
	removeStarted,
	rename,
	renameStarted,
	typeAddName as typeAddNameEvent,
	typeRename as typeRenameEvent,
} from "./professionalsEvents.ts";

export type {
	OpenRow,
	ProfessionalsError,
} from "./professionalsEvents.ts";

// The events live in professionalsEvents.ts.
export function useProfessionals() {
	const [state, setState] = useState<ProfessionalsState>(
		initialProfessionalsState,
	);

	useEffect(() => {
		let active = true;
		load().then((update) => {
			if (active) setState(update);
		});
		return () => {
			active = false;
		};
	}, []);

	const typeAddName = useCallback((addName: string) => {
		setState((s) => typeAddNameEvent(s, addName));
	}, []);

	const add = useCallback(async (name: string) => {
		setState(addStarted);
		setState(await addEvent(name));
	}, []);

	const openRename = useCallback((professional: Professional) => {
		setState((s) => openRenameEvent(s, professional));
	}, []);

	const typeRename = useCallback((name: string) => {
		setState((s) => typeRenameEvent(s, name));
	}, []);

	const save = useCallback(async (id: number, name: string) => {
		setState(renameStarted);
		setState(await rename(id, name));
	}, []);

	const openRemove = useCallback((professional: Professional) => {
		setState((s) => openRemoveEvent(s, professional));
	}, []);

	const remove = useCallback(async (id: number) => {
		setState(removeStarted);
		setState(await removeEvent(id));
	}, []);

	const close = useCallback(() => {
		setState(closeEvent);
	}, []);

	const openHours = useCallback((professional: Professional) => {
		setState((s) => openHoursEvent(s, professional));
	}, []);

	const hours: HoursSection = useMemo(
		() => ({
			report: (report) => {
				const answer = hoursReported(report);
				if (typeof answer === "function") setState(answer);
				else answer.then(setState);
			},
			close,
		}),
		[close],
	);

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
		openHours,
		hours,
	};
}
