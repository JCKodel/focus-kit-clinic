import { expect, it } from "vitest";
import { checkName } from "./name.ts";

it("keeps the name trimmed", () => {
	expect(checkName("  Ana Costa \t")).toEqual({ ok: true, value: "Ana Costa" });
});

it("refuses a blank name and one of spaces only", () => {
	expect(checkName("")).toEqual({ ok: false, error: "InvalidName" });
	expect(checkName("   ")).toEqual({ ok: false, error: "InvalidName" });
});

it("accepts 80 characters and refuses 81", () => {
	expect(checkName("a".repeat(80)).ok).toBe(true);
	expect(checkName("a".repeat(81))).toEqual({
		ok: false,
		error: "InvalidName",
	});
});

it("counts characters, not code units", () => {
	expect(checkName("é".repeat(80)).ok).toBe(true);
	expect(checkName("é".repeat(81))).toEqual({
		ok: false,
		error: "InvalidName",
	});
});

it("counts the length after trimming", () => {
	expect(checkName(` ${"a".repeat(80)} `).ok).toBe(true);
});
