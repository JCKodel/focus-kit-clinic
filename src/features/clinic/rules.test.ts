import { describe, expect, it } from "vitest";
import {
	checkClinicName,
	checkOwnerEmail,
	checkOwnerPassword,
	checkSlotMinutes,
	checkTimeZone,
	type SetupAnswers,
	setUpClinic,
} from "./rules.ts";

describe("checkClinicName", () => {
	it("keeps the name trimmed", () => {
		expect(checkClinicName("  Clinica Sol ")).toEqual({
			ok: true,
			value: "Clinica Sol",
		});
	});

	it("refuses a blank name", () => {
		expect(checkClinicName("")).toEqual({
			ok: false,
			error: "InvalidClinicName",
		});
		expect(checkClinicName("   ")).toEqual({
			ok: false,
			error: "InvalidClinicName",
		});
	});

	it("accepts 80 characters and refuses 81", () => {
		expect(checkClinicName("a".repeat(80)).ok).toBe(true);
		expect(checkClinicName("a".repeat(81))).toEqual({
			ok: false,
			error: "InvalidClinicName",
		});
	});

	it("counts characters, not code units", () => {
		expect(checkClinicName("é".repeat(80)).ok).toBe(true);
		expect(checkClinicName("🦷".repeat(80)).ok).toBe(true);
	});
});

describe("checkTimeZone", () => {
	it("accepts an IANA name and UTC", () => {
		expect(checkTimeZone("Europe/Lisbon")).toEqual({
			ok: true,
			value: "Europe/Lisbon",
		});
		expect(checkTimeZone("UTC")).toEqual({ ok: true, value: "UTC" });
	});

	it("refuses a name that is not an IANA time zone", () => {
		expect(checkTimeZone("Mars/Olympus")).toEqual({
			ok: false,
			error: "UnknownTimeZone",
		});
		expect(checkTimeZone("")).toEqual({ ok: false, error: "UnknownTimeZone" });
	});
});

describe("checkSlotMinutes", () => {
	it("gives 30 for an empty answer", () => {
		expect(checkSlotMinutes("")).toEqual({ ok: true, value: 30 });
	});

	it("accepts 5 and 240", () => {
		expect(checkSlotMinutes("5")).toEqual({ ok: true, value: 5 });
		expect(checkSlotMinutes("240")).toEqual({ ok: true, value: 240 });
	});

	it("refuses 4, 245 and 32", () => {
		for (const raw of ["4", "245", "32"]) {
			expect(checkSlotMinutes(raw)).toEqual({
				ok: false,
				error: "InvalidSlotMinutes",
			});
		}
	});

	it("refuses what is not a whole number", () => {
		for (const raw of ["30.0", "-30", "thirty", "1e2"]) {
			expect(checkSlotMinutes(raw)).toEqual({
				ok: false,
				error: "InvalidSlotMinutes",
			});
		}
	});
});

describe("checkOwnerEmail", () => {
	it("keeps the email trimmed and in lower case", () => {
		expect(checkOwnerEmail("  Owner@Example.com ")).toEqual({
			ok: true,
			value: "owner@example.com",
		});
	});

	it("refuses an email without exactly one @ with text on both sides", () => {
		for (const raw of ["owner", "@example.com", "owner@", "a@b@c"]) {
			expect(checkOwnerEmail(raw)).toEqual({
				ok: false,
				error: "InvalidEmail",
			});
		}
	});

	it("refuses an email with spaces", () => {
		expect(checkOwnerEmail("the owner@example.com")).toEqual({
			ok: false,
			error: "InvalidEmail",
		});
	});
});

describe("checkOwnerPassword", () => {
	it("refuses 11 characters and accepts 12", () => {
		const eleven = "a".repeat(11);
		const twelve = "a".repeat(12);
		expect(checkOwnerPassword(eleven, eleven)).toEqual({
			ok: false,
			error: "PasswordTooShort",
		});
		expect(checkOwnerPassword(twelve, twelve)).toEqual({
			ok: true,
			value: twelve,
		});
	});

	it("refuses two passwords that differ", () => {
		expect(checkOwnerPassword("correct horse", "correct house")).toEqual({
			ok: false,
			error: "PasswordsDiffer",
		});
	});
});

describe("setUpClinic", () => {
	const answers: SetupAnswers = {
		name: " Clinica Sol ",
		timeZone: "Europe/Lisbon",
		slotMinutes: "",
		email: " Owner@Example.com",
		password: "correct horse battery",
		passwordAgain: "correct horse battery",
	};

	it("gives the clinic and the owner from valid answers", () => {
		expect(setUpClinic(answers, false)).toEqual({
			ok: true,
			value: {
				name: "Clinica Sol",
				timeZone: "Europe/Lisbon",
				slotMinutes: 30,
				email: "owner@example.com",
				password: "correct horse battery",
			},
		});
	});

	it("refuses a clinic already set up before any other check", () => {
		expect(setUpClinic({ ...answers, name: "" }, true)).toEqual({
			ok: false,
			error: "ClinicAlreadySetUp",
		});
	});

	it("gives each refusal of its answer", () => {
		const cases: [Partial<SetupAnswers>, string][] = [
			[{ name: "" }, "InvalidClinicName"],
			[{ timeZone: "Mars/Olympus" }, "UnknownTimeZone"],
			[{ slotMinutes: "32" }, "InvalidSlotMinutes"],
			[{ email: "owner" }, "InvalidEmail"],
			[{ password: "short", passwordAgain: "short" }, "PasswordTooShort"],
			[{ passwordAgain: "something else" }, "PasswordsDiffer"],
		];
		for (const [change, error] of cases) {
			expect(setUpClinic({ ...answers, ...change }, false)).toEqual({
				ok: false,
				error,
			});
		}
	});
});
