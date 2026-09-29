import { expect, it } from "vitest";
import { err, ok } from "../../lib/result.ts";
import { initialClinicState, load } from "./clinicEvents.ts";

it("gives ready with the name", async () => {
	const update = await load({ fetchClinicName: async () => ok("Clinica Sol") });

	expect(update(initialClinicState)).toEqual({
		kind: "ready",
		name: "Clinica Sol",
	});
});

it("gives notSetUp", async () => {
	const update = await load({
		fetchClinicName: async () => err({ code: "ClinicNotSetUp" } as const),
	});

	expect(update(initialClinicState)).toEqual({ kind: "notSetUp" });
});

it("gives unreachable", async () => {
	const update = await load({
		fetchClinicName: async () => err({ code: "ServerUnreachable" } as const),
	});

	expect(update(initialClinicState)).toEqual({ kind: "unreachable" });
});
