import type { Started, Update } from "../../lib/update.ts";
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

export type { Weekday };

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
	// the key of the next period read or added
	nextKey: number;
};

export const initialWeeklyHoursState: WeeklyHoursState = {
	loading: true,
	periods: [],
	unreachable: false,
	nextKey: 0,
};

// What the editor reports to the professionals section, which holds the busy
// state, the open row and the messages above the list.
export type WeeklyHoursReport = "saving" | "saved" | "failed" | SectionRefusal;

export type WeeklyHoursAnswer = {
	update: Update<WeeklyHoursState>;
	report?: WeeklyHoursReport;
};

export type WeeklyHoursRepositories = {
	fetchWeeklyHours: typeof fetchWeeklyHours;
	putWeeklyHours: typeof putWeeklyHours;
};

export const weeklyHoursRepositories: WeeklyHoursRepositories = {
	fetchWeeklyHours,
	putWeeklyHours,
};

// Added by "Add period", then edited in the fields.
const newPeriod = { start: "09:00", end: "17:00" };

function withKeys(
	state: WeeklyHoursState,
	periods: WorkingPeriod[],
): { periods: DraftPeriod[]; nextKey: number } {
	return {
		periods: periods.map((period, i) => ({
			...period,
			key: state.nextKey + i,
		})),
		nextKey: state.nextKey + periods.length,
	};
}

export async function load(
	professionalId: number,
	repositories = weeklyHoursRepositories,
): Promise<WeeklyHoursAnswer> {
	const result = await repositories.fetchWeeklyHours(professionalId);
	if (result.ok) {
		const { slotMinutes, periods } = result.value;
		return {
			update: (s) => ({
				loading: false,
				slotMinutes,
				...withKeys(s, periods),
				unreachable: false,
			}),
		};
	}
	const code = result.error.code;
	const update = (s: WeeklyHoursState) => ({
		...s,
		loading: false,
		unreachable: code === "ServerUnreachable",
	});
	return code === "ServerUnreachable" ? { update } : { update, report: code };
}

export function addPeriod(
	state: WeeklyHoursState,
	weekday: Weekday,
): WeeklyHoursState {
	const added = withKeys(state, [{ weekday, ...newPeriod }]);
	return {
		...state,
		periods: [...state.periods, ...added.periods],
		nextKey: added.nextKey,
	};
}

export function typeTime(
	state: WeeklyHoursState,
	key: number,
	field: "start" | "end",
	time: string,
): WeeklyHoursState {
	return {
		...state,
		periods: state.periods.map((p) =>
			p.key === key ? { ...p, [field]: time } : p,
		),
	};
}

export function removePeriod(
	state: WeeklyHoursState,
	key: number,
): WeeklyHoursState {
	return { ...state, periods: state.periods.filter((p) => p.key !== key) };
}

function withoutKeys(drafts: DraftPeriod[]): WorkingPeriod[] {
	return drafts.map(({ weekday, start, end }) => ({ weekday, start, end }));
}

// The rule is checked here only to place the message beside the refused
// period; the server checks it again. The check reads `state`, the one the
// person acted on; `update` puts its answer on the current state, so what
// was typed, added or removed meanwhile survives.
export function saveStarted(
	state: WeeklyHoursState,
): Started<WeeklyHoursState> {
	const { slotMinutes, periods: drafts } = state;
	if (slotMinutes === undefined) {
		return { update: (current) => current, send: false };
	}
	const checked = setWeeklyHours(withoutKeys(drafts), slotMinutes);
	if (!checked.ok) {
		const { code, index } = checked.error;
		const refusal = { code, key: drafts[index].key };
		return {
			update: (current) => ({ ...current, unreachable: false, refusal }),
			send: false,
		};
	}
	return {
		update: (current) => ({
			...current,
			unreachable: false,
			refusal: undefined,
		}),
		send: true,
	};
}

// `drafts` are the periods of the state given to `saveStarted`, the one the
// person acted on.
export async function save(
	professionalId: number,
	drafts: DraftPeriod[],
	repositories = weeklyHoursRepositories,
): Promise<WeeklyHoursAnswer> {
	const result = await repositories.putWeeklyHours(
		professionalId,
		withoutKeys(drafts),
	);
	if (result.ok) return { update: (s) => s, report: "saved" };
	const code = result.error.code;
	if (code !== "ServerUnreachable") return { update: (s) => s, report: code };
	return { update: (s) => ({ ...s, unreachable: true }), report: "failed" };
}
