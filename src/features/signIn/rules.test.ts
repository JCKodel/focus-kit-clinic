import { describe, expect, it } from "vitest";
import { isSessionLive, sessionExpiry } from "./rules.ts";

describe("sessionExpiry", () => {
	it("is 30 days after now, in ISO 8601 UTC", () => {
		expect(sessionExpiry(new Date("2026-09-28T10:00:00.000Z"))).toBe(
			"2026-10-28T10:00:00.000Z",
		);
	});
});

describe("isSessionLive", () => {
	const expiresAt = "2026-10-28T10:00:00.000Z";

	it("is live one millisecond before its expiry", () => {
		expect(isSessionLive(expiresAt, new Date("2026-10-28T09:59:59.999Z"))).toBe(
			true,
		);
	});

	it("is not live at its expiry", () => {
		expect(isSessionLive(expiresAt, new Date(expiresAt))).toBe(false);
	});
});
