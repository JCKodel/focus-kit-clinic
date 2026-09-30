import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../lib/result.ts";
import type { Booked, Slots } from "./api.ts";
import {
	type BookingOutcome,
	type BookingRepositories,
	type BookingState,
	back,
	daysOf,
	done,
	initialBookingState,
	loadProfessionals,
	loadProfessionalsStarted,
	loadSlots,
	loadSlotsStarted,
	pickDay,
	pickTime,
	retryOf,
	submit,
	submitStarted,
	tooLateToCancel,
	typeName,
} from "./bookingEvents.ts";

function unexpected(): never {
	throw new Error("not called in this test");
}

function fake(repositories: Partial<BookingRepositories>): BookingRepositories {
	return {
		fetchProfessionals: unexpected,
		fetchSlots: unexpected,
		postAppointment: unexpected,
		remember: unexpected,
		...repositories,
	};
}

const unreachable = err({ code: "ServerUnreachable" } as const);

// The answer of an event that resolves to an update, applied to `current`.
function applied(outcome: BookingOutcome, current: BookingState) {
	if (!("update" in outcome)) throw new Error("expected an update");
	return outcome.update(current);
}

const now = new Date("2026-09-28T12:00:00.000Z");
const ana = { id: 1, name: "Ana Lima" };
const rui = { id: 2, name: "Rui Costa" };

// Lisbon is UTC+1 in October: the last slot is 00:30 on 3 October there.
const slots: Slots = {
	timeZone: "Europe/Lisbon",
	slots: [
		"2026-10-01T08:00:00.000Z",
		"2026-10-01T08:30:00.000Z",
		"2026-10-02T23:30:00.000Z",
	],
};

const loaded: BookingState = {
	...initialBookingState,
	loading: false,
	professionals: [ana, rui],
};

const onDays: BookingState = {
	...loaded,
	step: { kind: "days", professional: ana },
	slots,
};

const onForm: BookingState = {
	...onDays,
	step: {
		kind: "form",
		professional: ana,
		date: "2026-10-01",
		startsAt: "2026-10-01T08:00:00.000Z",
	},
	name: "Rita Sousa",
	phone: "912 345 678",
};

const booked: Booked = {
	bookingCode: "K7P2QX",
	startsAt: "2026-10-01T08:00:00.000Z",
	clientPhone: "912345678",
	professional: ana,
};

describe("loading the professionals", () => {
	it("publishes them", async () => {
		const started = loadProfessionalsStarted(initialBookingState);
		const outcome = await loadProfessionals(
			fake({ fetchProfessionals: async () => ok([ana, rui]) }),
		);

		expect(applied(outcome, started)).toEqual({
			...initialBookingState,
			loading: false,
			professionals: [ana, rui],
		});
	});

	it("fails with `professionals` when the server is unreachable", async () => {
		const outcome = await loadProfessionals(
			fake({ fetchProfessionals: async () => unreachable }),
		);

		expect(applied(outcome, initialBookingState)).toMatchObject({
			loading: false,
			failed: "professionals",
		});
	});

	it("keeps the message given to the in-flight state", async () => {
		const started = loadProfessionalsStarted(onDays, "ProfessionalNotFound");
		expect(started).toMatchObject({
			step: { kind: "professionals" },
			loading: true,
			message: "ProfessionalNotFound",
		});

		const outcome = await loadProfessionals(
			fake({ fetchProfessionals: async () => ok([rui]) }),
		);

		expect(applied(outcome, started).message).toBe("ProfessionalNotFound");
	});
});

describe("loading the slots", () => {
	const answering = fake({ fetchSlots: async () => ok(slots) });

	it("shows the days of the professional", async () => {
		const started = loadSlotsStarted(loaded, ana);
		expect(started).toMatchObject({
			step: { kind: "days", professional: ana },
			loading: true,
			slots: undefined,
		});

		const state = applied(await loadSlots(ana, undefined, answering), started);

		expect(state).toMatchObject({
			step: { kind: "days", professional: ana },
			loading: false,
			slots,
			message: undefined,
		});
	});

	it("after a refusal, shows the times of the date when it still has a slot", async () => {
		const after = { message: "SlotTaken", date: "2026-10-01" } as const;

		const state = applied(await loadSlots(ana, after, answering), loaded);

		expect(state).toMatchObject({
			step: { kind: "times", professional: ana, date: "2026-10-01" },
			message: "SlotTaken",
		});
	});

	it("after a refusal, shows the days when the date has no slot left", async () => {
		const after = { message: "SlotTaken", date: "2026-10-02" } as const;

		const state = applied(await loadSlots(ana, after, answering), loaded);

		expect(state).toMatchObject({
			step: { kind: "days", professional: ana },
			message: "SlotTaken",
		});
	});

	it("loads the professionals next when the professional is gone", async () => {
		const outcome = await loadSlots(
			ana,
			undefined,
			fake({
				fetchSlots: async () => err({ code: "ProfessionalNotFound" } as const),
			}),
		);

		expect(outcome).toEqual({
			next: "loadProfessionals",
			message: "ProfessionalNotFound",
		});
	});

	it("fails with `slots` when the server is unreachable", async () => {
		const outcome = await loadSlots(
			ana,
			undefined,
			fake({ fetchSlots: async () => unreachable }),
		);

		expect(applied(outcome, loadSlotsStarted(loaded, ana))).toMatchObject({
			loading: false,
			failed: "slots",
		});
	});
});

describe("moving between the steps", () => {
	it("picks a day, then a time", () => {
		const times = pickDay(onDays, "2026-10-01");
		expect(times.step).toEqual({
			kind: "times",
			professional: ana,
			date: "2026-10-01",
		});

		const form = pickTime(
			{ ...times, nameError: "InvalidClientName" },
			"2026-10-01T08:30:00.000Z",
		);
		expect(form.step).toEqual({
			kind: "form",
			professional: ana,
			date: "2026-10-01",
			startsAt: "2026-10-01T08:30:00.000Z",
		});
		expect(form.nameError).toBeUndefined();
	});

	it("ignores a day or a time picked on another step", () => {
		expect(pickDay(loaded, "2026-10-01")).toBe(loaded);
		expect(pickTime(onDays, "2026-10-01T08:00:00.000Z")).toBe(onDays);
	});

	it("goes back one step from each, clearing loading, message and failed", () => {
		const noise = {
			loading: true,
			message: "SlotTaken",
			failed: "slots",
		} as const;
		const times: BookingState = {
			...onDays,
			...noise,
			step: { kind: "times", professional: ana, date: "2026-10-01" },
		};
		const cleared = {
			loading: false,
			message: undefined,
			failed: undefined,
		};

		expect(back({ ...onForm, ...noise })).toMatchObject({
			...cleared,
			step: { kind: "times", professional: ana, date: "2026-10-01" },
		});
		expect(back(times)).toMatchObject({
			...cleared,
			step: { kind: "days", professional: ana },
		});
		expect(back({ ...onDays, ...noise })).toMatchObject({
			...cleared,
			step: { kind: "professionals" },
		});
	});

	it("goes back to the professionals when done", () => {
		const bookedStep: BookingState = {
			...onForm,
			step: { kind: "booked", booked, timeZone: "Europe/Lisbon" },
		};

		expect(done(bookedStep).step).toEqual({ kind: "professionals" });
	});
});

describe("booking", () => {
	it("sends the checked form and marks it busy", () => {
		const { update, send } = submitStarted(onForm);

		expect(send).toBe(true);
		expect(update(onForm)).toEqual({
			...onForm,
			nameError: undefined,
			phoneError: undefined,
			busy: true,
			failed: undefined,
		});
	});

	it("sends nothing when the name or phone is refused", () => {
		const refused = { ...onForm, name: " ", phone: "12" };
		const { update, send } = submitStarted(refused);

		expect(send).toBe(false);
		expect(update(refused)).toMatchObject({
			nameError: "InvalidClientName",
			phoneError: "InvalidPhoneNumber",
			busy: false,
		});
	});

	it("sends nothing away from the form", () => {
		const { update, send } = submitStarted(onDays);

		expect(send).toBe(false);
		expect(update(onDays)).toBe(onDays);
	});

	it("remembers the booked appointment and shows it with the fields emptied", async () => {
		const { update, send } = submitStarted(onForm);
		expect(send).toBe(true);
		const started = update(onForm);
		expect(started.busy).toBe(true);
		const postAppointment = vi.fn(async () => ok(booked));
		const remember = vi.fn(() => ok(undefined));

		const outcome = await submit(
			onForm,
			now,
			fake({ postAppointment, remember }),
		);

		expect(postAppointment).toHaveBeenCalledWith({
			professionalId: 1,
			startsAt: "2026-10-01T08:00:00.000Z",
			clientName: "Rita Sousa",
			clientPhone: "912 345 678",
		});
		expect(remember).toHaveBeenCalledWith(
			{
				bookingCode: "K7P2QX",
				clientPhone: "912345678",
				professionalName: "Ana Lima",
				startsAt: "2026-10-01T08:00:00.000Z",
				timeZone: "Europe/Lisbon",
			},
			now,
		);
		expect(applied(outcome, started)).toMatchObject({
			step: { kind: "booked", booked, timeZone: "Europe/Lisbon" },
			busy: false,
			name: "",
			phone: "",
		});
	});

	it("reloads the slots with the message and the date when the slot is taken", async () => {
		const outcome = await submit(
			onForm,
			now,
			fake({
				postAppointment: async () => err({ code: "SlotTaken" } as const),
			}),
		);

		expect(outcome).toEqual({
			next: "loadSlots",
			professional: ana,
			after: { message: "SlotTaken", date: "2026-10-01" },
		});
	});

	it("reloads the professionals when the professional is gone", async () => {
		const outcome = await submit(
			onForm,
			now,
			fake({
				postAppointment: async () =>
					err({ code: "ProfessionalNotFound" } as const),
			}),
		);

		expect(outcome).toEqual({
			next: "loadProfessionals",
			message: "ProfessionalNotFound",
		});
	});

	it("fails with `book` when the server is unreachable", async () => {
		const started = submitStarted(onForm).update(onForm);
		const outcome = await submit(
			onForm,
			now,
			fake({ postAppointment: async () => unreachable }),
		);

		expect(applied(outcome, started)).toMatchObject({
			busy: false,
			failed: "book",
		});
	});

	it("keeps a name typed in flight through a taken slot", async () => {
		const started = submitStarted(onForm).update(onForm);
		const taken = await submit(
			onForm,
			now,
			fake({
				postAppointment: async () => err({ code: "SlotTaken" } as const),
			}),
		);
		if (!("next" in taken) || taken.next !== "loadSlots") {
			throw new Error("expected the slots next");
		}
		const typed = typeName(started, "Rita Sousa Lima");

		const reloading = loadSlotsStarted(typed, taken.professional);
		const reloaded = applied(
			await loadSlots(
				taken.professional,
				taken.after,
				fake({ fetchSlots: async () => ok(slots) }),
			),
			reloading,
		);

		expect(reloaded).toMatchObject({
			name: "Rita Sousa Lima",
			busy: false,
			step: { kind: "times", date: "2026-10-01" },
			message: "SlotTaken",
		});
	});
});

describe("retryOf", () => {
	it("repeats the professionals", () => {
		expect(retryOf({ ...loaded, failed: "professionals" })).toEqual({
			next: "loadProfessionals",
		});
	});

	it("repeats the booking", () => {
		const failed: BookingState = { ...onForm, failed: "book" };

		expect(retryOf(failed)).toEqual({ next: "submit", state: failed });
	});

	// Today's behaviour: slot-taken-retry will keep the message and the date.
	it("repeats the slots of the professional without `after`", () => {
		expect(
			retryOf({ ...onDays, failed: "slots", message: "SlotTaken" }),
		).toEqual({ next: "loadSlots", professional: ana });
	});

	it("repeats nothing when nothing failed", () => {
		expect(retryOf(onDays)).toBeUndefined();
	});
});

describe("display", () => {
	it("groups the slots by clinic date", () => {
		expect(daysOf(slots)).toEqual([
			{
				date: "2026-10-01",
				starts: ["2026-10-01T08:00:00.000Z", "2026-10-01T08:30:00.000Z"],
			},
			{ date: "2026-10-03", starts: ["2026-10-02T23:30:00.000Z"] },
		]);
		expect(daysOf(undefined)).toEqual([]);
	});

	it("is too late to cancel only on the form, once the deadline is past", () => {
		const deadline = new Date("2026-09-30T08:00:00.000Z");
		const after = new Date(deadline.getTime() + 1);

		expect(tooLateToCancel(onForm, deadline)).toBe(false);
		expect(tooLateToCancel(onForm, after)).toBe(true);
		expect(tooLateToCancel(pickDay(onDays, "2026-10-01"), after)).toBe(false);
	});
});
