import { expect, it } from "vitest";
import { normaliseEmail } from "./email.ts";

it("trims the email and puts it in lower case", () => {
	expect(normaliseEmail("  Owner@Example.COM \t")).toBe("owner@example.com");
});
