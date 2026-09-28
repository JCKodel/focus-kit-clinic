import { normaliseEmail } from "../../lib/email.ts";
import { checkName } from "../../lib/name.ts";
import { err, ok, type Result } from "../../lib/result.ts";

export type SetupAnswers = {
	name: string;
	timeZone: string;
	slotMinutes: string;
	email: string;
	password: string;
	passwordAgain: string;
};

export type ClinicSetup = {
	name: string;
	timeZone: string;
	slotMinutes: number;
	email: string;
	password: string;
};

export type SetupRefusal =
	| "ClinicAlreadySetUp"
	| "InvalidClinicName"
	| "UnknownTimeZone"
	| "InvalidSlotMinutes"
	| "InvalidEmail"
	| "PasswordTooShort"
	| "PasswordsDiffer";

export const defaultSlotMinutes = 30;
const minPasswordLength = 12;

// Lengths count characters, not UTF-16 units, so "é" or an emoji is one.
function length(text: string): number {
	return [...text].length;
}

export function checkClinicName(
	raw: string,
): Result<string, "InvalidClinicName"> {
	const name = checkName(raw);
	return name.ok ? name : err("InvalidClinicName");
}

export function checkTimeZone(raw: string): Result<string, "UnknownTimeZone"> {
	const timeZone = raw.trim();
	const known =
		timeZone === "UTC" || Intl.supportedValuesOf("timeZone").includes(timeZone);
	return known ? ok(timeZone) : err("UnknownTimeZone");
}

export function checkSlotMinutes(
	raw: string,
): Result<number, "InvalidSlotMinutes"> {
	const text = raw.trim();
	if (text === "") return ok(defaultSlotMinutes);
	if (!/^\d+$/.test(text)) return err("InvalidSlotMinutes");
	const minutes = Number(text);
	if (minutes < 5 || minutes > 240 || minutes % 5 !== 0) {
		return err("InvalidSlotMinutes");
	}
	return ok(minutes);
}

export function checkOwnerEmail(raw: string): Result<string, "InvalidEmail"> {
	const email = normaliseEmail(raw);
	const parts = email.split("@");
	const valid =
		parts.length === 2 &&
		parts[0] !== "" &&
		parts[1] !== "" &&
		!/\s/.test(email);
	return valid ? ok(email) : err("InvalidEmail");
}

export function checkOwnerPassword(
	first: string,
	again: string,
): Result<string, "PasswordTooShort" | "PasswordsDiffer"> {
	if (length(first) < minPasswordLength) return err("PasswordTooShort");
	if (first !== again) return err("PasswordsDiffer");
	return ok(first);
}

// Runs every check in the order the setup command asks; the first refusal
// wins, and a clinic already set up is refused before anything else.
export function setUpClinic(
	answers: SetupAnswers,
	alreadySetUp: boolean,
): Result<ClinicSetup, SetupRefusal> {
	if (alreadySetUp) return err("ClinicAlreadySetUp");
	const name = checkClinicName(answers.name);
	if (!name.ok) return name;
	const timeZone = checkTimeZone(answers.timeZone);
	if (!timeZone.ok) return timeZone;
	const slotMinutes = checkSlotMinutes(answers.slotMinutes);
	if (!slotMinutes.ok) return slotMinutes;
	const email = checkOwnerEmail(answers.email);
	if (!email.ok) return email;
	const password = checkOwnerPassword(answers.password, answers.passwordAgain);
	if (!password.ok) return password;
	return ok({
		name: name.value,
		timeZone: timeZone.value,
		slotMinutes: slotMinutes.value,
		email: email.value,
		password: password.value,
	});
}
