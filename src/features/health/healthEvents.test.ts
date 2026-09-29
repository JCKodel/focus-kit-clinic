import { expect, it } from "vitest";
import { err, ok } from "../../lib/result.ts";
import { check, initialHealthState } from "./healthEvents.ts";

it("gives ok", async () => {
	const update = await check({ fetchHealth: async () => ok("ok" as const) });

	expect(update(initialHealthState)).toBe("ok");
});

it("gives unreachable", async () => {
	const update = await check({
		fetchHealth: async () => err({ code: "ServerUnreachable" } as const),
	});

	expect(update(initialHealthState)).toBe("unreachable");
});
