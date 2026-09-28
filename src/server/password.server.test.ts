import { expect, it } from "vitest";
import { checkPassword, fixedHash, hashPassword } from "./password.server.ts";

const format = /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/;

it("hashes in the scrypt format with a 16 byte salt and a 64 byte key", async () => {
	const hash = await hashPassword("correct horse battery");

	expect(hash).toMatch(format);
	expect(hash).not.toContain("correct horse battery");
});

it("checks true for its password and false for another", async () => {
	const hash = await hashPassword("correct horse battery");

	expect(await checkPassword("correct horse battery", hash)).toBe(true);
	expect(await checkPassword("correct horse battery!", hash)).toBe(false);
});

it("gives a new salt each time", async () => {
	expect(await hashPassword("same password")).not.toBe(
		await hashPassword("same password"),
	);
});

it("reads N, r and p from the stored string", async () => {
	const hash = await hashPassword("correct horse battery");
	const otherCost = hash.replace("scrypt$16384$8$1$", "scrypt$1024$8$1$");

	// Same salt and key, another cost: the key no longer matches.
	expect(await checkPassword("correct horse battery", otherCost)).toBe(false);
});

it("never matches a malformed hash", async () => {
	expect(await checkPassword("anything", "")).toBe(false);
	expect(await checkPassword("anything", "scrypt$x$8$1$salt$key")).toBe(false);
	expect(await checkPassword("anything", "bcrypt$16384$8$1$a$b")).toBe(false);
});

it("has a fixed hash in the same format", () => {
	expect(fixedHash).toMatch(format);
});
