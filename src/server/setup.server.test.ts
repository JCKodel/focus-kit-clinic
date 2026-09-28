import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { checkPassword } from "./password.server.ts";

const command = fileURLToPath(new URL("./setup.server.ts", import.meta.url));

let folder: string;
let databasePath: string;

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), "setup-"));
	databasePath = join(folder, "clinic.sqlite");
});

afterEach(() => {
	rmSync(folder, { recursive: true, force: true });
});

function setup(lines: string[]) {
	return spawnSync(process.execPath, [command], {
		input: lines.map((line) => `${line}\n`).join(""),
		env: { ...process.env, DATABASE_PATH: databasePath },
		encoding: "utf8",
	});
}

function rows(table: string) {
	const db = new DatabaseSync(databasePath);
	try {
		return db.prepare(`SELECT * FROM ${table}`).all();
	} finally {
		db.close();
	}
}

const answers = [
	"  Clinica Sol ",
	"Europe/Lisbon",
	"",
	" Owner@Example.com",
	"correct horse battery",
	"correct horse battery",
];

it("writes the clinic and the owner and exits 0", async () => {
	const run = setup(answers);

	expect(run.status).toBe(0);
	expect(run.stdout).toContain(
		"Clinic Clinica Sol is set up. Sign in at /owner.",
	);
	expect(rows("clinic")).toEqual([
		{
			id: 1,
			name: "Clinica Sol",
			time_zone: "Europe/Lisbon",
			slot_minutes: 30,
		},
	]);
	const [owner] = rows("owner");
	expect(owner.email).toBe("owner@example.com");
	expect(String(owner.password_hash)).toMatch(/^scrypt\$16384\$8\$1\$/);
	expect(
		await checkPassword("correct horse battery", String(owner.password_hash)),
	).toBe(true);
});

it("asks again after each refusal", () => {
	const run = setup([
		"",
		"Clinica Sol",
		"Mars/Olympus",
		"UTC",
		"32",
		"45",
		"owner",
		"owner@example.com",
		"short",
		"correct horse battery",
		"correct horse batterY",
		"correct horse battery",
		"correct horse battery",
	]);

	expect(run.status).toBe(0);
	for (const message of [
		"The name must have from 1 to 80 characters.",
		"That is not an IANA time zone.",
		"The length must be a whole number from 5 to 240, in steps of 5.",
		"That is not an email address.",
		"The password must have 12 characters or more.",
		"The two passwords differ. Type them again.",
	]) {
		expect(run.stdout).toContain(message);
	}
	expect(rows("clinic")).toEqual([
		{ id: 1, name: "Clinica Sol", time_zone: "UTC", slot_minutes: 45 },
	]);
});

it("refuses a second run before asking, exits 1 and changes nothing", () => {
	setup(answers);
	const before = { clinic: rows("clinic"), owner: rows("owner") };

	const run = setup(["Other clinic", ...answers.slice(1)]);

	expect(run.status).toBe(1);
	expect(run.stderr).toContain("The clinic is already set up.");
	expect(run.stdout).not.toContain("Clinic name:");
	expect({ clinic: rows("clinic"), owner: rows("owner") }).toEqual(before);
});

it("writes nothing and exits 1 when the input ends early", () => {
	const run = setup(answers.slice(0, 5));

	expect(run.status).toBe(1);
	expect(rows("clinic")).toEqual([]);
	expect(rows("owner")).toEqual([]);
});

it("writes nothing and exits 1 when the input ends on a refused answer", () => {
	const run = setup(["Clinica Sol", "Mars/Olympus"]);

	expect(run.status).toBe(1);
	expect(rows("clinic")).toEqual([]);
});
