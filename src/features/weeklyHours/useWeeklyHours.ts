import { useCallback, useEffect, useRef, useState } from "react";
import {
	fetchWeeklyHours,
	putWeeklyHours,
	type SectionRefusal,
} from "./api.ts";
import {
	setWeeklyHours,
	type Weekday,
	type WeeklyHoursRefusal,
	type WorkingPeriod,
} from "./rules.ts";

// A period as typed, with a key that outlives edits and removals.
export type DraftPeriod = WorkingPeriod & { key: number };

export type WeeklyHoursState = {
	loading: boolean;
	// undefined while loading, or when the first read failed
	slotMinutes?: number;
	periods: DraftPeriod[];
	unreachable: boolean;
	// the first refused period only
	refusal?: { code: WeeklyHoursRefusal; key: number };
};

// What the editor reports to the professionals section, which holds the busy
// state, the open row and the messages above the list.
export type HoursSection = {
	saving: () => void;
	saved: () => void;
	failed: () => void;
	refused: (code: SectionRefusal) => void;
	close: () => void;
};

const initial: WeeklyHoursState = {
	loading: true,
	periods: [],
	unreachable: false,
};

// Added by "Add period", then edited in the fields.
const newPeriod = { start: "09:00", end: "17:00" };

export function useWeeklyHours(professionalId: number, section: HoursSection) {
	const [state, setState] = useState<WeeklyHoursState>(initial);
	const nextKey = useRef(0);
	const sectionRef = useRef(section);
	sectionRef.current = section;

	const withKey = useCallback(
		(period: WorkingPeriod): DraftPeriod => ({
			...period,
			key: nextKey.current++,
		}),
		[],
	);

	useEffect(() => {
		let active = true;
		fetchWeeklyHours(professionalId).then((result) => {
			if (!active) return;
			if (result.ok) {
				setState({
					loading: false,
					slotMinutes: result.value.slotMinutes,
					periods: result.value.periods.map(withKey),
					unreachable: false,
				});
				return;
			}
			const code = result.error.code;
			setState((s) => ({
				...s,
				loading: false,
				unreachable: code === "ServerUnreachable",
			}));
			if (code !== "ServerUnreachable") sectionRef.current.refused(code);
		});
		return () => {
			active = false;
		};
	}, [professionalId, withKey]);

	const addPeriod = useCallback(
		(weekday: Weekday) => {
			setState((s) => ({
				...s,
				periods: [...s.periods, withKey({ weekday, ...newPeriod })],
			}));
		},
		[withKey],
	);

	const typeTime = useCallback(
		(key: number, field: "start" | "end", time: string) => {
			setState((s) => ({
				...s,
				periods: s.periods.map((p) =>
					p.key === key ? { ...p, [field]: time } : p,
				),
			}));
		},
		[],
	);

	const removePeriod = useCallback((key: number) => {
		setState((s) => ({
			...s,
			periods: s.periods.filter((p) => p.key !== key),
		}));
	}, []);

	// The rule is checked here only to place the message beside the refused
	// period; the server checks it again.
	const save = useCallback(async () => {
		const { slotMinutes, periods: drafts } = state;
		if (slotMinutes === undefined) return;
		const periods = drafts.map(({ weekday, start, end }) => ({
			weekday,
			start,
			end,
		}));
		const checked = setWeeklyHours(periods, slotMinutes);
		if (!checked.ok) {
			const { code, index } = checked.error;
			setState((s) => ({
				...s,
				unreachable: false,
				refusal: { code, key: drafts[index].key },
			}));
			return;
		}
		setState((s) => ({ ...s, unreachable: false, refusal: undefined }));
		sectionRef.current.saving();
		const result = await putWeeklyHours(professionalId, periods);
		if (result.ok) return sectionRef.current.saved();
		const code = result.error.code;
		if (code !== "ServerUnreachable") return sectionRef.current.refused(code);
		sectionRef.current.failed();
		setState((s) => ({ ...s, unreachable: true }));
	}, [state, professionalId]);

	return { state, addPeriod, typeTime, removePeriod, save };
}
