import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./migrate.server.ts";

let folder: string;
let db: DatabaseSync;

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), "migrate-"));
	db = new DatabaseSync(":memory:");
});

afterEach(() => {
	db.close();
	rmSync(folder, { recursive: true, force: true });
});

function write(files: Record<string, string>) {
	for (const [name, sql] of Object.entries(files)) {
		writeFileSync(join(folder, name), sql);
	}
}

function recorded(): string[] {
	return db
		.prepare("SELECT name FROM schema_migration ORDER BY name")
		.all()
		.map((row) => String(row.name));
}

function tables(): string[] {
	return db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'schema_migration' ORDER BY name",
		)
		.all()
		.map((row) => String(row.name));
}

describe("migrate", () => {
	it("applies the files in file name order", () => {
		write({
			"0002-b.sql": "INSERT INTO a (step) VALUES ('second');",
			"0001-a.sql":
				"CREATE TABLE a (step TEXT); INSERT INTO a VALUES ('first');",
			"0010-c.sql": "INSERT INTO a (step) VALUES ('third');",
		});

		const result = migrate(db, folder);

		expect(result).toEqual({
			ok: true,
			value: ["0001-a.sql", "0002-b.sql", "0010-c.sql"],
		});
		const steps = db.prepare("SELECT step FROM a ORDER BY rowid").all();
		expect(steps.map((row) => row.step)).toEqual(["first", "second", "third"]);
	});

	it("records each applied file with a UTC instant", () => {
		write({
			"0001-a.sql": "CREATE TABLE a (x);",
			"0002-b.sql": "CREATE TABLE b (x);",
		});

		migrate(db, folder);

		const rows = db
			.prepare("SELECT name, applied_at FROM schema_migration ORDER BY name")
			.all();
		expect(rows.map((row) => row.name)).toEqual(["0001-a.sql", "0002-b.sql"]);
		for (const row of rows) {
			expect(String(row.applied_at)).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		}
	});

	it("skips files already applied", () => {
		write({ "0001-a.sql": "CREATE TABLE a (x);" });
		migrate(db, folder);
		write({ "0002-b.sql": "CREATE TABLE b (x);" });

		expect(migrate(db, folder)).toEqual({ ok: true, value: ["0002-b.sql"] });
		expect(migrate(db, folder)).toEqual({ ok: true, value: [] });
		expect(recorded()).toEqual(["0001-a.sql", "0002-b.sql"]);
	});

	it("ignores files that do not match NNNN-<name>.sql", () => {
		write({
			"0001-a.sql": "CREATE TABLE a (x);",
			"README.md": "not sql",
			"1-short.sql": "CREATE TABLE short (x);",
			"0002-b.sql.bak": "CREATE TABLE bak (x);",
			"00003-long.sql": "CREATE TABLE long (x);",
		});

		expect(migrate(db, folder)).toEqual({ ok: true, value: ["0001-a.sql"] });
		expect(tables()).toEqual(["a"]);
	});

	it("rolls back a failing file, leaves it unrecorded and names it", () => {
		write({
			"0001-a.sql": "CREATE TABLE a (x);",
			"0002-b.sql": "CREATE TABLE b (x); INSERT INTO missing VALUES (1);",
			"0003-c.sql": "CREATE TABLE c (x);",
		});

		const result = migrate(db, folder);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("MigrationFailed");
		expect(result.error.file).toBe("0002-b.sql");
		expect(result.error.message).toContain("missing");
		expect(tables()).toEqual(["a"]);
		expect(recorded()).toEqual(["0001-a.sql"]);
		expect(db.isTransaction).toBe(false);
	});

	it("finds nothing to apply in the real migrations folder", () => {
		const real = fileURLToPath(new URL("./migrations/", import.meta.url));
		expect(migrate(db, real)).toEqual({ ok: true, value: [] });
	});
});
