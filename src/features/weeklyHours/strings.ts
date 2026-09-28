import type { Weekday, WeeklyHoursRefusal } from "./rules.ts";

export const strings = {
	hoursOf: (name: string) => `Hours of ${name}`,
	loading: "Loading hours",
	days: {
		1: "Monday",
		2: "Tuesday",
		3: "Wednesday",
		4: "Thursday",
		5: "Friday",
		6: "Saturday",
		7: "Sunday",
	} satisfies Record<Weekday, string>,
	closed: "Closed",
	from: "From",
	to: "To",
	addPeriod: "Add period",
	removePeriod: "Remove period",
	save: "Save hours",
	cancel: "Cancel",
	unreachable: "The server cannot be reached. Try again.",
};

export const refusalStrings: Record<
	WeeklyHoursRefusal,
	(slotMinutes: number) => string
> = {
	InvalidWorkingPeriod: () =>
		"Use times from 00:00 to 23:55 in steps of 5 minutes, with To after From.",
	WorkingPeriodTooShort: (slotMinutes) =>
		`A period must last at least ${slotMinutes} minutes.`,
	WorkingPeriodsOverlap: () => "This period overlaps another on the same day.",
};
