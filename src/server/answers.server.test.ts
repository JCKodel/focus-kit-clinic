import { type Context, Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
	badRequest,
	clinicNotSetUp,
	databaseFailed,
	notSignedIn,
	professionalNotFound,
} from "./answers.server.ts";

async function answerOf(answer: (c: Context) => Response) {
	const app = new Hono().get("/", (c) => answer(c));
	const response = await app.request("/");
	return { status: response.status, body: await response.json() };
}

describe("the shared error answers", () => {
	it("badRequest answers 400 BadRequest", async () => {
		expect(await answerOf(badRequest)).toEqual({
			status: 400,
			body: { error: { code: "BadRequest" } },
		});
	});

	it("notSignedIn answers 401 NotSignedIn", async () => {
		expect(await answerOf(notSignedIn)).toEqual({
			status: 401,
			body: { error: { code: "NotSignedIn" } },
		});
	});

	it("professionalNotFound answers 404 ProfessionalNotFound", async () => {
		expect(await answerOf(professionalNotFound)).toEqual({
			status: 404,
			body: { error: { code: "ProfessionalNotFound" } },
		});
	});

	it("clinicNotSetUp answers 500 ClinicNotSetUp", async () => {
		expect(await answerOf(clinicNotSetUp)).toEqual({
			status: 500,
			body: { error: { code: "ClinicNotSetUp" } },
		});
	});

	it("databaseFailed answers 500 DatabaseFailed", async () => {
		expect(await answerOf(databaseFailed)).toEqual({
			status: 500,
			body: { error: { code: "DatabaseFailed" } },
		});
	});
});
