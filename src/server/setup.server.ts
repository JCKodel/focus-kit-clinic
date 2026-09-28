import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import {
	findClinic,
	saveClinicAndOwner,
} from "../features/clinic/repository.server.ts";
import {
	checkClinicName,
	checkOwnerEmail,
	checkOwnerPassword,
	checkSlotMinutes,
	checkTimeZone,
	type SetupRefusal,
	setUpClinic,
} from "../features/clinic/rules.ts";
import { refusalStrings, setupStrings } from "../features/clinic/strings.ts";
import type { Result } from "../lib/result.ts";
import { hashPassword } from "./password.server.ts";
import { openMigratedDatabase } from "./start.server.ts";

// `npm run setup`: creates the clinic and the owner, once. In a terminal it
// asks each question and hides the passwords; with piped input it reads one
// answer per line.

const db = openMigratedDatabase();

const existing = findClinic(db);
if (!existing.ok) {
	console.error(`Cannot read the database: ${existing.error.message}`);
	process.exit(1);
}
if (existing.value) {
	console.error(refusalStrings.ClinicAlreadySetUp);
	process.exit(1);
}

const isTerminal = process.stdin.isTTY === true;
let muted = false;
// Readline echoes what is typed through this stream; muting it hides the
// passwords.
const output = new Writable({
	write(chunk, encoding, done) {
		if (!muted) process.stdout.write(chunk, encoding);
		done();
	},
});
const reader = createInterface({
	input: process.stdin,
	output,
	terminal: isTerminal,
});
reader.on("SIGINT", () => reader.close());
const lines = reader[Symbol.asyncIterator]();

// Undefined when the input has ended.
async function ask(
	question: string,
	hidden = false,
): Promise<string | undefined> {
	if (hidden) {
		reader.setPrompt("");
		process.stdout.write(question);
	} else {
		reader.setPrompt(question);
		reader.prompt();
	}
	muted = hidden;
	const next = await lines.next();
	muted = false;
	if (hidden || !isTerminal) process.stdout.write("\n");
	return next.done ? undefined : next.value;
}

// Asks until `check` accepts the answer, printing each refusal.
async function askValid(
	question: string,
	check: (raw: string) => Result<unknown, SetupRefusal>,
	hidden = false,
): Promise<string | undefined> {
	for (;;) {
		const answer = await ask(question, hidden);
		if (answer === undefined) return undefined;
		const checked = check(answer);
		if (checked.ok) return answer;
		console.log(refusalStrings[checked.error]);
	}
}

async function askPasswords(): Promise<[string, string] | undefined> {
	for (;;) {
		const first = await askValid(
			setupStrings.password,
			(raw) => checkOwnerPassword(raw, raw),
			true,
		);
		if (first === undefined) return undefined;
		const again = await ask(setupStrings.passwordAgain, true);
		if (again === undefined) return undefined;
		const checked = checkOwnerPassword(first, again);
		if (checked.ok) return [first, again];
		console.log(refusalStrings[checked.error]);
	}
}

function inputEnded(): never {
	console.error(setupStrings.inputEnded);
	process.exit(1);
}

const name =
	(await askValid(setupStrings.name, checkClinicName)) ?? inputEnded();
const timeZone =
	(await askValid(setupStrings.timeZone, checkTimeZone)) ?? inputEnded();
const slotMinutes =
	(await askValid(setupStrings.slotMinutes, checkSlotMinutes)) ?? inputEnded();
const email =
	(await askValid(setupStrings.email, checkOwnerEmail)) ?? inputEnded();
const [password, passwordAgain] = (await askPasswords()) ?? inputEnded();
reader.close();

const setup = setUpClinic(
	{ name, timeZone, slotMinutes, email, password, passwordAgain },
	false,
);
if (!setup.ok) {
	console.error(refusalStrings[setup.error]);
	process.exit(1);
}

const saved = saveClinicAndOwner(db, {
	name: setup.value.name,
	timeZone: setup.value.timeZone,
	slotMinutes: setup.value.slotMinutes,
	email: setup.value.email,
	passwordHash: await hashPassword(setup.value.password),
});
if (!saved.ok) {
	console.error(`Cannot save the clinic: ${saved.error.message}`);
	process.exit(1);
}

console.log(setupStrings.done(setup.value.name));
process.exit(0);
