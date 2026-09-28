import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt$N$r$p$<salt base64url>$<key base64url>
const cost = { N: 16384, r: 8, p: 1 };
const saltBytes = 16;
const keyBytes = 64;

function derive(
	password: string,
	salt: Buffer,
	length: number,
	options: typeof cost,
): Promise<Buffer | undefined> {
	return new Promise((resolve) => {
		// maxmem above scrypt's need (128 * N * r) so a stored cost is honoured.
		const maxmem = 256 * options.N * options.r;
		scrypt(password, salt, length, { ...options, maxmem }, (error, key) =>
			resolve(error ? undefined : key),
		);
	});
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(saltBytes);
	const key = await derive(password, salt, keyBytes, cost);
	// With the fixed cost above scrypt does not fail; the empty key keeps the
	// type honest and can never be matched, since checks need a key.
	return [
		"scrypt",
		cost.N,
		cost.r,
		cost.p,
		salt.toString("base64url"),
		(key ?? Buffer.alloc(0)).toString("base64url"),
	].join("$");
}

// Reads N, r and p from the stored string. A malformed string never matches.
export async function checkPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") return false;
	const [N, r, p] = parts.slice(1, 4).map(Number);
	if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
	const salt = Buffer.from(parts[4], "base64url");
	const expected = Buffer.from(parts[5], "base64url");
	if (expected.length === 0) return false;
	const key = await derive(password, salt, expected.length, { N, r, p });
	return key !== undefined && timingSafeEqual(key, expected);
}

// Checked when the email is not the owner's or the clinic is not set up, so
// a wrong email costs the same scrypt run as a wrong password. Made once at
// server start from a random password, never stored.
export const fixedHash = await hashPassword(
	randomBytes(32).toString("base64url"),
);
