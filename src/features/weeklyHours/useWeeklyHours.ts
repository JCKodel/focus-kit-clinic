import { useCallback, useEffect, useRef, useState } from "react";
import {
	addPeriod as addPeriodEvent,
	initialWeeklyHoursState,
	load,
	removePeriod as removePeriodEvent,
	save as saveEvent,
	saveStarted,
	typeTime as typeTimeEvent,
	type Weekday,
	type WeeklyHoursReport,
	type WeeklyHoursState,
} from "./weeklyHoursEvents.ts";

export type { DraftPeriod } from "./weeklyHoursEvents.ts";

export type HoursSection = {
	report: (report: WeeklyHoursReport) => void;
	close: () => void;
};

// The events live in weeklyHoursEvents.ts; the hook holds the state and
// passes each report to the section.
export function useWeeklyHours(professionalId: number, section: HoursSection) {
	const [state, setState] = useState<WeeklyHoursState>(initialWeeklyHoursState);
	const sectionRef = useRef(section);
	sectionRef.current = section;

	useEffect(() => {
		let active = true;
		load(professionalId).then(({ update, report }) => {
			if (!active) return;
			setState(update);
			if (report) sectionRef.current.report(report);
		});
		return () => {
			active = false;
		};
	}, [professionalId]);

	const addPeriod = useCallback((weekday: Weekday) => {
		setState((s) => addPeriodEvent(s, weekday));
	}, []);

	const typeTime = useCallback(
		(key: number, field: "start" | "end", time: string) => {
			setState((s) => typeTimeEvent(s, key, field, time));
		},
		[],
	);

	const removePeriod = useCallback((key: number) => {
		setState((s) => removePeriodEvent(s, key));
	}, []);

	const save = useCallback(async () => {
		const started = saveStarted(state);
		setState(started.update);
		if (!started.send) return;
		sectionRef.current.report("saving");
		const { update, report } = await saveEvent(professionalId, state.periods);
		setState(update);
		if (report) sectionRef.current.report(report);
	}, [state, professionalId]);

	return { state, addPeriod, typeTime, removePeriod, save };
}
