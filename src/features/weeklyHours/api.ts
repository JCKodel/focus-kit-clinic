import { request, type ServerUnreachable } from "../../lib/request.ts";
import type { Result } from "../../lib/result.ts";
import { isWorkingPeriod, type WorkingPeriod } from "./rules.ts";

export type WeeklyHours = { slotMinutes: number; periods: WorkingPeriod[] };

// Reported up to the professionals section, which shows them (docs/01).
export type SectionRefusal = "ProfessionalNotFound" | "NotSignedIn";

export type HoursError = { code: SectionRefusal } | ServerUnreachable;

function weeklyHoursOf(body: unknown): WeeklyHours | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const slotMinutes: unknown = Reflect.get(body, "slotMinutes");
	const periods: unknown = Reflect.get(body, "periods");
	if (typeof slotMinutes !== "number" || !Array.isArray(periods)) {
		return undefined;
	}
	return periods.every(isWorkingPeriod) ? { slotMinutes, periods } : undefined;
}

// The client checks the rule with the server's slotMinutes before sending,
// so it never meets a 400: one would mean the server cannot be relied on.
const refusals = {
	401: { code: "NotSignedIn" },
	404: { code: "ProfessionalNotFound" },
} as const;

function hoursPath(professionalId: number): string {
	return `/api/owner/professionals/${professionalId}/hours`;
}

export function fetchWeeklyHours(
	professionalId: number,
): Promise<Result<WeeklyHours, HoursError>> {
	return request<WeeklyHours, { code: SectionRefusal }>(
		hoursPath(professionalId),
		{},
		weeklyHoursOf,
		refusals,
	);
}

export function putWeeklyHours(
	professionalId: number,
	periods: WorkingPeriod[],
): Promise<Result<WeeklyHours, HoursError>> {
	return request<WeeklyHours, { code: SectionRefusal }>(
		hoursPath(professionalId),
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ periods }),
		},
		weeklyHoursOf,
		refusals,
	);
}
