import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDatabase, transaction } from "./database.server.ts";

function opened(path: string): DatabaseSync {
	const result = openDatabase(path);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

// Runs in a worker thread, in plain Node: opens the file through
// openDatabase, writes inside BEGIN IMMEDIATE, says so, holds the lock for
// 200 ms, then commits.
const holdWriteLock = `
const { parentPort, workerData } = require("node:worker_threads");
import(workerData.module).then(({ openDatabase }) => {
	const db = openDatabase(workerData.path).value;
	db.exec("BEGIN IMMEDIATE");
	db.prepare("INSERT INTO t (x) VALUES (1)").run();
	parentPort.postMessage("locked");
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
	db.exec("COMMIT");
	db.close();
});
`;

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

it("waits up to 5000 ms for a lock held by another connection", () => {
	const db = opened(join(root, "clinic.sqlite"));

	expect(db.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
	db.close();
});

it("lets a write wait for another connection's write, then succeed", async () => {
	const path = join(root, "clinic.sqlite");
	const db = opened(path);
	db.exec("CREATE TABLE t (x INTEGER NOT NULL)");
	const worker = new Worker(holdWriteLock, {
		eval: true,
		workerData: {
			module: new URL("./database.server.ts", import.meta.url).href,
			path,
		},
	});
	const exited = once(worker, "exit");
	await once(worker, "message");

	const started = Date.now();
	const written = transaction(db, () =>
		db.prepare("INSERT INTO t (x) VALUES (2)").run(),
	);
	const waited = Date.now() - started;

	expect(written.ok).toBe(true);
	expect(waited).toBeGreaterThanOrEqual(100);
	expect(await exited).toEqual([0]);
	expect(db.prepare("SELECT x FROM t ORDER BY x").all()).toEqual([
		{ x: 1 },
		{ x: 2 },
	]);
	db.close();
});

it("takes the write lock when the transaction begins", () => {
	const path = join(root, "clinic.sqlite");
	const db = opened(path);
	db.exec("CREATE TABLE t (x INTEGER NOT NULL)");
	// No busy timeout: fails at once while another connection holds the lock.
	const other = new DatabaseSync(path);

	const done = transaction(db, () => {
		expect(() => other.exec("BEGIN IMMEDIATE")).toThrow(/locked/);
	});

	expect(done.ok).toBe(true);
	other.close();
	db.close();
});
