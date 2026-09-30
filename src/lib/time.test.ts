import { expect, it } from "vitest";
import { minutesOf } from "./time.ts";

it("reads midnight as 0", () => {
	expect(minutesOf("00:00")).toBe(0);
});

it("reads 09:30 as 570", () => {
	expect(minutesOf("09:30")).toBe(570);
});

it("reads the last time of the day, 23:55, as 1435", () => {
	expect(minutesOf("23:55")).toBe(1435);
});
