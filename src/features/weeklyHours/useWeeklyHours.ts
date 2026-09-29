import { useCallback, useEffect, useRef, useState } from "react";
import {
	addPeriod as addPeriodEvent,
	initialWeeklyHoursState,
	load,
	removePeriod as removePeriodEvent,
	type SectionRefusal,
	save as saveEvent,
	saveStarted,
	typeTime as typeTimeEvent,
	type Weekday,
	type WeeklyHoursReport,
	type WeeklyHoursState,
} from "./weeklyHoursEvents.ts";

export type { DraftPeriod } from "./weeklyHoursEvents.ts";

// What the editor reports to the professionals section, which holds the busy
// state, the open row and the messages above the list.
export type HoursSection = {
	saving: () => void;
	saved: () => void;
	failed: () => void;
	refused: (code: SectionRefusal) => void;
	close: () => void;
};

function forward(section: HoursSection, report?: WeeklyHoursReport) {
	if (report === "saved") section.saved();
	else if (report === "failed") section.failed();
	else if (report) section.refused(report);
}

// The events live in weeklyHoursEvents.ts; the hook holds the state and
// forwards each report to the section.
export function useWeeklyHours(professionalId: number, section: HoursSection) {
	const [state, setState] = useState<WeeklyHoursState>(initialWeeklyHoursState);
	const sectionRef = useRef(section);
	sectionRef.current = section;

	useEffect(() => {
		let active = true;
		load(professionalId).then(({ update, report }) => {
			if (!active) return;
			setState(update);
			forward(sectionRef.current, report);
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
		setState(started.state);
		if (!started.send) return;
		sectionRef.current.saving();
		const { update, report } = await saveEvent(professionalId, state.periods);
		setState(update);
		forward(sectionRef.current, report);
	}, [state, professionalId]);

	return { state, addPeriod, typeTime, removePeriod, save };
}
