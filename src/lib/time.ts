// Minutes since midnight of a clinic wall time "HH:MM" (docs/03,
// WorkingPeriod). It trusts its input: setWeeklyHours checks the time
// before calling it, and freeSlots reads stored periods. First use:
// setWeeklyHours; second use: freeSlots.
export function minutesOf(time: string): number {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
