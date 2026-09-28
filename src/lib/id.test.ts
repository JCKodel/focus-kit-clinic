import { expect, it } from "vitest";
import { idOf } from "./id.ts";

it("reads a positive whole number", () => {
	expect(idOf("1")).toBe(1);
	expect(idOf("42")).toBe(42);
});

it("refuses anything else", () => {
	for (const param of [
		"",
		"abc",
		"0",
		"-1",
		"1.5",
		"01",
		"1e3",
		"9".repeat(20),
	]) {
		expect(idOf(param)).toBeUndefined();
	}
});
