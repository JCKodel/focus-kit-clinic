import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../lib/result.ts";
import type { Cancelled } from "./api.ts";
import {
	type CancelRepositories,
	type CancelState,
	close,
	initialCancelState,
	open,
	submit,
	submitStarted,
	typeCode,
	typePhone,
} from "./cancelEvents.ts";

function unexpected(): never {
	throw new Error("not called in this test");
}

function fake(repositories: Partial<CancelRepositories>): CancelRepositories {
	return { postCancellation: unexpected, forget: unexpected, ...repositories };
}

const now = new Date("2026-09-28T12:00:00.000Z");

const cancelled: Cancelled = {
	startsAt: "2026-10-01T08:00:00.000Z",
	timeZone: "Europe/Lisbon",
	professional: { id: 1, name: "Ana Lima" },
};

const typed: CancelState = typeCode(
	typePhone(open(), "912 345 678"),
	" k7p2qx ",
);

it("opens and closes the empty form", () => {
	expect(open()).toEqual({ ...initialCancelState, open: true });
	expect(close()).toEqual(initialCancelState);
	expect(initialCancelState).toEqual({
		open: false,
		phone: "",
		code: "",
		busy: false,
	});
});

describe("submitting", () => {
	it("is busy in flight and clears the old message", () => {
		expect(
			submitStarted({ ...typed, message: "ServerUnreachable" }),
		).toMatchObject({ busy: true, message: undefined });
	});

	it.each([
		"AppointmentNotFound",
		"CancellationTooLate",
		"ServerUnreachable",
	] as const)("keeps what was typed and shows %s", async (code) => {
		const started = submitStarted(typed);
		const update = await submit(
			typed.phone,
			typed.code,
			now,
			fake({ postCancellation: async () => err({ code }) }),
		);

		expect(update(started)).toEqual({
			...typed,
			busy: false,
			message: code,
		});
	});

	it("forgets the normalized code and shows the cancellation with the fields emptied", async () => {
		const postCancellation = vi.fn(async () => ok(cancelled));
		const forget = vi.fn(() => ok(undefined));

		const update = await submit(
			typed.phone,
			typed.code,
			now,
			fake({ postCancellation, forget }),
		);

		expect(postCancellation).toHaveBeenCalledWith({
			clientPhone: "912 345 678",
			bookingCode: " k7p2qx ",
		});
		expect(forget).toHaveBeenCalledWith("K7P2QX", now);
		expect(update(submitStarted(typed))).toEqual({
			...initialCancelState,
			open: true,
			cancelled,
		});
	});

	it("forgets nothing when the code does not normalize, and still shows the success", async () => {
		const forget = vi.fn(() => ok(undefined));

		const update = await submit(
			"912 345 678",
			"not a code",
			now,
			fake({ postCancellation: async () => ok(cancelled), forget }),
		);

		expect(forget).not.toHaveBeenCalled();
		expect(update(typed).cancelled).toEqual(cancelled);
	});
});
