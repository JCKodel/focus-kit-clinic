import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../lib/result.ts";
import {
	addPeriod,
	initialWeeklyHoursState,
	load,
	removePeriod,
	save,
	saveStarted,
	typeTime,
	type WeeklyHoursRepositories,
	type WeeklyHoursState,
} from "./weeklyHoursEvents.ts";

function unexpected(): never {
	throw new Error("not called in this test");
}

function fake(
	repositories: Partial<WeeklyHoursRepositories>,
): WeeklyHoursRepositories {
	return {
		fetchWeeklyHours: unexpected,
		putWeeklyHours: unexpected,
		...repositories,
	};
}

const unreachable = err({ code: "ServerUnreachable" } as const);

const monday = { weekday: 1, start: "09:00", end: "13:00" } as const;
const tuesday = { weekday: 2, start: "14:00", end: "18:00" } as const;
const hours = { slotMinutes: 30, periods: [monday, tuesday] };

const loaded: WeeklyHoursState = {
	loading: false,
	slotMinutes: 30,
	periods: [
		{ ...monday, key: 0 },
		{ ...tuesday, key: 1 },
	],
	unreachable: false,
	nextKey: 2,
};

describe("the load", () => {
	it("gives the periods with fresh keys", async () => {
		const fetchWeeklyHours = vi.fn(async () => ok(hours));

		const { update, report } = await load(7, fake({ fetchWeeklyHours }));

		expect(fetchWeeklyHours).toHaveBeenCalledWith(7);
		expect(report).toBeUndefined();
		expect(update(initialWeeklyHoursState)).toEqual(loaded);
		expect(update({ ...initialWeeklyHoursState, nextKey: 5 }).periods).toEqual([
			{ ...monday, key: 5 },
			{ ...tuesday, key: 6 },
		]);
	});

	it("reports a section refusal without setting unreachable", async () => {
		const { update, report } = await load(
			7,
			fake({
				fetchWeeklyHours: async () =>
					err({ code: "ProfessionalNotFound" } as const),
			}),
		);

		expect(report).toBe("ProfessionalNotFound");
		expect(update(initialWeeklyHoursState)).toMatchObject({
			loading: false,
			unreachable: false,
		});
	});

	it("sets unreachable when the server is", async () => {
		const { update, report } = await load(
			7,
			fake({ fetchWeeklyHours: async () => unreachable }),
		);

		expect(report).toBeUndefined();
		expect(update(initialWeeklyHoursState)).toMatchObject({
			loading: false,
			unreachable: true,
		});
	});
});

describe("editing", () => {
	it("adds 09:00 to 17:00 on the weekday with a new key", () => {
		const added = addPeriod(loaded, 3);

		expect(added.periods.at(-1)).toEqual({
			weekday: 3,
			start: "09:00",
			end: "17:00",
			key: 2,
		});
		expect(added.nextKey).toBe(3);
	});

	it("edits and removes by key", () => {
		const edited = typeTime(loaded, 1, "end", "19:00");
		expect(edited.periods).toEqual([
			{ ...monday, key: 0 },
			{ ...tuesday, end: "19:00", key: 1 },
		]);

		expect(removePeriod(edited, 0).periods).toEqual([
			{ ...tuesday, end: "19:00", key: 1 },
		]);
	});
});

describe("saving", () => {
	it("marks the first refused period and sends nothing", () => {
		const typed = typeTime(
			typeTime(loaded, 0, "end", "09:15"),
			1,
			"end",
			"13:00",
		);

		const acted = { ...typed, unreachable: true };
		const { update, send } = saveStarted(acted);

		expect(send).toBe(false);
		expect(update(acted)).toMatchObject({
			unreachable: false,
			refusal: { code: "WorkingPeriodTooShort", key: 0 },
		});
	});

	it("sends the checked week and keeps a time typed after the click", () => {
		const acted = { ...loaded, unreachable: true };
		const { update, send } = saveStarted(acted);

		const current = typeTime(acted, 1, "end", "19:00");

		expect(send).toBe(true);
		expect(update(current)).toEqual({
			...current,
			unreachable: false,
			refusal: undefined,
		});
		expect(update(current).periods[1].end).toBe("19:00");
	});

	it("refuses the checked week and keeps a time typed after the click", () => {
		const acted = typeTime(loaded, 0, "end", "09:15");
		const { update, send } = saveStarted(acted);

		const current = typeTime(acted, 1, "end", "19:00");

		expect(send).toBe(false);
		expect(update(current)).toEqual({
			...current,
			unreachable: false,
			refusal: { code: "WorkingPeriodTooShort", key: 0 },
		});
		expect(update(current).periods[1].end).toBe("19:00");
	});

	it("sends nothing before the load", () => {
		const { update, send } = saveStarted(initialWeeklyHoursState);

		expect(send).toBe(false);
		expect(update(loaded)).toBe(loaded);
	});

	it("clears the old refusal when it sends", () => {
		const acted: WeeklyHoursState = {
			...loaded,
			refusal: { code: "InvalidWorkingPeriod", key: 1 },
		};
		const { update, send } = saveStarted(acted);

		expect(send).toBe(true);
		expect(update(acted).refusal).toBeUndefined();
	});

	it("sends the periods without keys and reports saved", async () => {
		const putWeeklyHours = vi.fn(async () => ok(hours));

		const { update, report } = await save(
			7,
			loaded.periods,
			fake({ putWeeklyHours }),
		);

		expect(putWeeklyHours).toHaveBeenCalledWith(7, [monday, tuesday]);
		expect(report).toBe("saved");
		expect(update(loaded)).toEqual(loaded);
	});

	it("reports the refusal", async () => {
		const { update, report } = await save(
			7,
			loaded.periods,
			fake({
				putWeeklyHours: async () => err({ code: "NotSignedIn" } as const),
			}),
		);

		expect(report).toBe("NotSignedIn");
		expect(update(loaded)).toEqual(loaded);
	});

	it("reports failed and sets unreachable when the server is", async () => {
		const { update, report } = await save(
			7,
			loaded.periods,
			fake({ putWeeklyHours: async () => unreachable }),
		);

		expect(report).toBe("failed");
		expect(update(loaded).unreachable).toBe(true);
	});
});
