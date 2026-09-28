import { afterEach, describe, expect, it, vi } from "vitest";
import { request, stringField } from "./request.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

function answer(status: number, body?: unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			body === undefined
				? new Response(null, { status })
				: Response.json(body, { status }),
		),
	);
}

const readName = (body: unknown) => stringField(body, "name");

describe("request", () => {
	it("gives what `read` accepts from a 2xx body", async () => {
		answer(200, { name: "Clinica Sol" });

		expect(await request("/api/x", {}, readName)).toEqual({
			ok: true,
			value: "Clinica Sol",
		});
	});

	it("gives the refusal named for the status", async () => {
		answer(404, { error: { code: "ClinicNotSetUp" } });

		expect(
			await request("/api/x", {}, readName, {
				404: { code: "ClinicNotSetUp" },
			}),
		).toEqual({ ok: false, error: { code: "ClinicNotSetUp" } });
	});

	it("gives ServerUnreachable for a status not named", async () => {
		answer(500, { error: { code: "DatabaseFailed" } });

		expect(await request("/api/x", {}, readName)).toEqual({
			ok: false,
			error: { code: "ServerUnreachable" },
		});
	});

	it("gives ServerUnreachable for a body `read` does not accept", async () => {
		answer(200, { other: 1 });

		expect(await request("/api/x", {}, readName)).toEqual({
			ok: false,
			error: { code: "ServerUnreachable" },
		});
	});

	it("gives ServerUnreachable when the network fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);

		expect(await request("/api/x", {}, readName)).toEqual({
			ok: false,
			error: { code: "ServerUnreachable" },
		});
	});

	it("reads no body from a 204", async () => {
		answer(204);

		expect(await request("/api/x", {}, (body) => body === undefined)).toEqual({
			ok: true,
			value: true,
		});
	});
});

describe("stringField", () => {
	it("gives the string at the key, or undefined", () => {
		expect(stringField({ email: "a@b" }, "email")).toBe("a@b");
		expect(stringField({ email: 1 }, "email")).toBeUndefined();
		expect(stringField(null, "email")).toBeUndefined();
		expect(stringField("text", "email")).toBeUndefined();
	});
});
