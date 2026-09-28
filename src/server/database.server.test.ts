import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, transaction } from "./database.server.ts";

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

it("commits a transaction whole, or rolls it back whole", () => {
	const db = new DatabaseSync(":memory:");
	db.exec("CREATE TABLE t (x INTEGER NOT NULL)");
	const insert = (x: number | null) =>
		db.prepare("INSERT INTO t (x) VALUES (?)").run(x);

	const committed = transaction(db, () => {
		insert(1);
		insert(2);
		return "done";
	});

	expect(committed).toEqual({
		ok: true,
		value: "done",
	});
	const failed = transaction(db, () => {
		insert(3);
		insert(null);
	});

	expect(failed.ok).toBe(false);
	if (!failed.ok) expect(failed.error.code).toBe("DatabaseFailed");
	expect(db.isTransaction).toBe(false);
	expect(db.prepare("SELECT x FROM t ORDER BY x").all()).toEqual([
		{ x: 1 },
		{ x: 2 },
	]);
	db.close();
});
