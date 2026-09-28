import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase } from "./database.server.ts";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "database-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

it("creates the missing folder and SQLite file", () => {
	const path = join(root, "data", "clinic.sqlite");

	const result = openDatabase(path);

	expect(result.ok).toBe(true);
	if (!result.ok) return;
	result.value.close();
	expect(existsSync(path)).toBe(true);
});
