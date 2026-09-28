import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { memoryDatabase } from "../../server/testDatabase.server.ts";
import {
	type ClinicAndOwner,
	findClinic,
	saveClinicAndOwner,
} from "./repository.server.ts";

let db: DatabaseSync;

beforeEach(() => {
	db = memoryDatabase();
});

afterEach(() => {
	db.close();
});

const setup: ClinicAndOwner = {
	name: "Clinica Sol",
	timeZone: "Europe/Lisbon",
	slotMinutes: 30,
	email: "owner@example.com",
	passwordHash: "scrypt$16384$8$1$salt$key",
};

function count(table: string): number {
	return Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);
}

it("finds no clinic before setup", () => {
	expect(findClinic(db)).toEqual({ ok: true, value: undefined });
});

it("writes the clinic and the owner together", () => {
	expect(saveClinicAndOwner(db, setup)).toEqual({ ok: true, value: undefined });

	expect(findClinic(db)).toEqual({
		ok: true,
		value: { name: "Clinica Sol", timeZone: "Europe/Lisbon", slotMinutes: 30 },
	});
	expect(db.prepare("SELECT email, password_hash FROM owner").all()).toEqual([
		{ email: "owner@example.com", password_hash: "scrypt$16384$8$1$salt$key" },
	]);
});

it("fails a second setup at the database and changes nothing", () => {
	saveClinicAndOwner(db, setup);

	const second = saveClinicAndOwner(db, { ...setup, name: "Other" });

	expect(second.ok).toBe(false);
	if (second.ok) return;
	expect(second.error.code).toBe("DatabaseFailed");
	expect(count("clinic")).toBe(1);
	expect(count("owner")).toBe(1);
	expect(findClinic(db)).toMatchObject({
		ok: true,
		value: { name: "Clinica Sol" },
	});
	expect(db.isTransaction).toBe(false);
});

it("writes neither when the owner cannot be written", () => {
	db.exec("INSERT INTO owner (id, email, password_hash) VALUES (1, 'x', 'y')");

	expect(saveClinicAndOwner(db, setup).ok).toBe(false);
	expect(count("clinic")).toBe(0);
});

it("refuses a length the database does not allow", () => {
	expect(saveClinicAndOwner(db, { ...setup, slotMinutes: 32 }).ok).toBe(false);
	expect(count("clinic")).toBe(0);
});
