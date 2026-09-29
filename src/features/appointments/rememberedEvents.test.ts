import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../lib/result.ts";
import type { Cancelled } from "./api.ts";
import type { RememberedAppointment } from "./remembered.ts";
import {
	ask,
	confirm,
	confirmStarted,
	initialRememberedState,
	keep,
	linesOf,
	type RememberedRepositories,
	type RememberedState,
	reread,
} from "./rememberedEvents.ts";

function unexpected(): never {
	throw new Error("not called in this test");
}

function fake(
	repositories: Partial<RememberedRepositories>,
): RememberedRepositories {
	return {
		readRemembered: unexpected,
		postCancellation: unexpected,
		forget: unexpected,
		...repositories,
	};
}

const now = new Date("2026-09-28T12:00:00.000Z");

function appointment(startsAt: string, bookingCode: string) {
	return {
		bookingCode,
		clientPhone: "912345678",
		professionalName: "Ana Lima",
		startsAt,
		timeZone: "Europe/Lisbon",
	} satisfies RememberedAppointment;
}

// More than 24 hours after `now`, then less.
const later = appointment("2026-10-02T08:00:00.000Z", "LATER2");
const soon = appointment("2026-09-29T08:00:00.000Z", "SOON22");

const cancelled: Cancelled = {
	startsAt: later.startsAt,
	timeZone: later.timeZone,
	professional: { id: 1, name: "Ana Lima" },
};

const listed: RememberedState = {
	appointments: [soon, later],
	states: {},
	gone: new Set(),
};

describe("the list", () => {
	it("holds what readRemembered gives at `now`", () => {
		const readRemembered = vi.fn(() => [soon, later]);

		const state = initialRememberedState(now, fake({ readRemembered }));

		expect(readRemembered).toHaveBeenCalledWith(now);
		expect(state).toEqual(listed);
	});

	it("reads again after a change, keeping the lines' states", () => {
		const asked = ask(listed, "LATER2");

		const state = reread(asked, now, fake({ readRemembered: () => [later] }));

		expect(state).toEqual({ ...asked, appointments: [later] });
	});

	it("is cancellable when the cancel use case allows it at `now`", () => {
		expect(linesOf(listed, now)).toEqual([
			{ appointment: soon, cancellable: false, state: undefined },
			{ appointment: later, cancellable: true, state: undefined },
		]);
	});

	it("leaves out those cancelled here", () => {
		const state = { ...listed, gone: new Set(["SOON22"]) };

		expect(linesOf(state, now).map((l) => l.appointment)).toEqual([later]);
	});
});

describe("a line", () => {
	it("asks to confirm, keeps, and is busy in flight", () => {
		const asked = ask(listed, "LATER2");
		expect(linesOf(asked, now)[1].state).toBe("confirm");
		expect(keep(asked, "LATER2").states).toEqual({});
		expect(confirmStarted(asked, "LATER2").states).toEqual({ LATER2: "busy" });
	});

	it.each([
		["CancellationTooLate", "tooLate"],
		["ServerUnreachable", "failed"],
	] as const)("on %s shows %s and forgets nothing", async (code, line) => {
		const forget = vi.fn(() => ok(undefined));

		const update = await confirm(
			later,
			now,
			fake({ postCancellation: async () => err({ code }), forget }),
		);

		expect(forget).not.toHaveBeenCalled();
		const state = update(confirmStarted(listed, "LATER2"));
		expect(state.states).toEqual({ LATER2: line });
		expect(state.gone.size).toBe(0);
	});

	it("on a success forgets it, removes the line and says it is cancelled", async () => {
		const postCancellation = vi.fn(async () => ok(cancelled));
		const forget = vi.fn(() => ok(undefined));

		const update = await confirm(
			later,
			now,
			fake({ postCancellation, forget }),
		);

		expect(postCancellation).toHaveBeenCalledWith({
			clientPhone: "912345678",
			bookingCode: "LATER2",
		});
		expect(forget).toHaveBeenCalledWith("LATER2", now);
		const state = update(confirmStarted(listed, "LATER2"));
		expect(state.states).toEqual({});
		expect(state.message).toEqual({ kind: "cancelled", cancelled });
		expect(linesOf(state, now).map((l) => l.appointment)).toEqual([soon]);
	});

	it("on AppointmentNotFound, removes the line even when storage failed", async () => {
		const update = await confirm(
			later,
			now,
			fake({
				postCancellation: async () =>
					err({ code: "AppointmentNotFound" } as const),
				forget: () => err({ code: "StorageFailed" } as const),
			}),
		);

		const state = update(listed);
		expect(state.message).toEqual({ kind: "notBooked" });
		expect(linesOf(state, now).map((l) => l.appointment)).toEqual([soon]);
	});
});
