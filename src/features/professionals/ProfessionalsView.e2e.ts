import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { signIn } from "../../server/e2eClinic.server.ts";

// Both projects and every test share one database, so each test names its
// professionals with its own tag and looks only at those.
function tagged(name: string, tag: string) {
	return `${name} ${tag}`;
}

let tag: string;

test.beforeEach(() => {
	tag = randomUUID().slice(0, 8);
});

async function openOwner(page: Page) {
	await page.goto("/owner");
	await signIn(page);
	await expect(
		page.getByRole("heading", { name: "Professionals" }),
	).toBeVisible();
	await expect(page.getByText("Loading professionals")).toHaveCount(0);
}

function nameField(page: Page) {
	return page.getByLabel("Name", { exact: true });
}

async function add(page: Page, name: string) {
	await nameField(page).fill(name);
	await page.getByRole("button", { name: "Add" }).click();
}

async function addAndWait(page: Page, name: string) {
	await add(page, name);
	await expect(row(page, name.trim())).toBeVisible();
}

function row(page: Page, name: string): Locator {
	return page.getByRole("listitem").filter({ hasText: name });
}

// The names shown in the list that carry this test's tag, in order.
async function namesOfThisTest(page: Page) {
	const names = await page.locator("li > span").allTextContents();
	return names.filter((name) => name.endsWith(tag));
}

async function namesOnServer(page: Page): Promise<string[]> {
	const response = await page.request.get("/api/professionals");
	const body: { professionals: { name: string }[] } = await response.json();
	return body.professionals.map((p) => p.name);
}

// `upper` sits above `lower` on the page.
async function expectAbove(upper: Locator, lower: Locator) {
	const a = await upper.boundingBox();
	const b = await lower.boundingBox();
	expect(a && b && a.y < b.y).toBe(true);
}

test("shows the heading, the list, the Name field and Add under Sign out", async ({
	page,
}) => {
	await openOwner(page);

	const signOut = page.getByRole("button", { name: "Sign out" });
	const heading = page.getByRole("heading", { name: "Professionals" });
	await expectAbove(signOut, heading);
	await expectAbove(heading, nameField(page));
	await expectAbove(nameField(page), page.getByRole("button", { name: "Add" }));
});

test("says so when there is no professional", async ({ page }) => {
	await page.route("**/api/professionals", (route) =>
		route.fulfill({ json: { professionals: [] } }),
	);

	await openOwner(page);

	await expect(page.getByText("No professionals yet.")).toBeVisible();
});

test("adds a trimmed name in its place and empties the field", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Bruno", tag));

	await add(page, `   ${tagged("ana", tag)}  `);

	await expect(row(page, tagged("ana", tag))).toBeVisible();
	await expect(nameField(page)).toHaveValue("");
	expect(await namesOfThisTest(page)).toEqual([
		tagged("ana", tag),
		tagged("Bruno", tag),
	]);
});

test("lists alphabetically ignoring case, and keeps the list on reload", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("carla", tag));
	await addAndWait(page, tagged("Ana", tag));
	await addAndWait(page, tagged("bruno", tag));

	const expected = [
		tagged("Ana", tag),
		tagged("bruno", tag),
		tagged("carla", tag),
	];
	expect(await namesOfThisTest(page)).toEqual(expected);
	for (const name of expected) {
		const item = row(page, name);
		await expect(item.getByRole("button", { name: "Rename" })).toBeVisible();
		await expect(item.getByRole("button", { name: "Remove" })).toBeVisible();
	}

	await page.reload();

	await expect(row(page, tagged("Ana", tag))).toBeVisible();
	expect(await namesOfThisTest(page)).toEqual(expected);
});

test("refuses a blank name or one over 80 characters, keeping what was typed", async ({
	page,
}) => {
	await openOwner(page);

	for (const typed of ["   ", `${tag}${"é".repeat(81 - tag.length)}`]) {
		await add(page, typed);

		await expect(
			page.getByText("Type a name of 1 to 80 characters."),
		).toBeVisible();
		await expect(nameField(page)).toHaveValue(typed);
	}
	expect((await namesOnServer(page)).some((n) => n.startsWith(tag))).toBe(
		false,
	);
});

test("refuses a name another professional has, in any case and with spaces", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana Costa", tag));
	const typed = `  ${tagged("ANA costa", tag).toUpperCase()} `;

	await add(page, typed);

	await expect(
		page.getByText("Another professional already has this name."),
	).toBeVisible();
	await expect(nameField(page)).toHaveValue(typed);
	expect(await namesOfThisTest(page)).toEqual([tagged("Ana Costa", tag)]);
});

test("renames a professional into its new place", async ({ page }) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await addAndWait(page, tagged("Bruno", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	const field = page.getByLabel(`New name for ${tagged("Ana", tag)}`);
	await expect(field).toHaveValue(tagged("Ana", tag));
	await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
	await field.fill(` ${tagged("Carla", tag)} `);
	await page.getByRole("button", { name: "Save" }).click();

	await expect(row(page, tagged("Carla", tag))).toBeVisible();
	expect(await namesOfThisTest(page)).toEqual([
		tagged("Bruno", tag),
		tagged("Carla", tag),
	]);
});

test("refuses a bad or taken name in the row, which stays open", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await addAndWait(page, tagged("Bruno", tag));
	await row(page, tagged("Bruno", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	const field = page.getByLabel(`New name for ${tagged("Bruno", tag)}`);

	for (const [typed, message] of [
		["  ", "Type a name of 1 to 80 characters."],
		["a".repeat(81), "Type a name of 1 to 80 characters."],
		[` ${tagged("ana", tag)} `, "Another professional already has this name."],
	]) {
		await field.fill(typed);
		await page.getByRole("button", { name: "Save" }).click();

		const refusal = page.getByRole("listitem").getByText(message);
		await expect(refusal).toBeVisible();
		await expect(field).toHaveValue(typed);
	}
	expect(await namesOnServer(page)).toContain(tagged("Bruno", tag));
});

test("accepts the professional's own name in another case", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();

	await page
		.getByLabel(`New name for ${tagged("Ana", tag)}`)
		.fill(tagged("ANA", tag));
	await page.getByRole("button", { name: "Save" }).click();

	await expect(row(page, tagged("ANA", tag))).toBeVisible();
	expect(await namesOfThisTest(page)).toEqual([tagged("ANA", tag)]);
});

test("Cancel returns the row to its name, unchanged", async ({ page }) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	await page
		.getByLabel(`New name for ${tagged("Ana", tag)}`)
		.fill(tagged("Other", tag));

	await page.getByRole("button", { name: "Cancel" }).click();

	await expect(row(page, tagged("Ana", tag))).toBeVisible();
	await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
	expect(await namesOfThisTest(page)).toEqual([tagged("Ana", tag)]);
});

test("opens one row at a time", async ({ page }) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await addAndWait(page, tagged("Bruno", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	await row(page, tagged("Bruno", tag))
		.getByRole("button", { name: "Remove" })
		.click();

	await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
	await expect(
		page.getByText(
			`Remove ${tagged("Bruno", tag)}? Clients will no longer see them.`,
		),
	).toBeVisible();

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();

	await expect(page.getByRole("button", { name: "Keep" })).toHaveCount(0);
	await expect(
		page.getByLabel(`New name for ${tagged("Ana", tag)}`),
	).toBeVisible();
});

test("asks before removing; Keep returns the row unchanged", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove" })
		.click();
	await expect(
		page.getByText(
			`Remove ${tagged("Ana", tag)}? Clients will no longer see them.`,
		),
	).toBeVisible();
	await page.getByRole("button", { name: "Keep" }).click();

	await expect(
		row(page, tagged("Ana", tag)).getByRole("button", { name: "Rename" }),
	).toBeVisible();
	expect(await namesOnServer(page)).toContain(tagged("Ana", tag));
});

test("removes a professional, for good, and its name can be added again", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await addAndWait(page, tagged("Bruno", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove" })
		.click();
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove", exact: true })
		.click();

	await expect(row(page, tagged("Ana", tag))).toHaveCount(0);
	expect(await namesOfThisTest(page)).toEqual([tagged("Bruno", tag)]);
	await page.reload();
	await expect(row(page, tagged("Bruno", tag))).toBeVisible();
	await expect(row(page, tagged("Ana", tag))).toHaveCount(0);

	await addAndWait(page, tagged("Ana", tag));
	expect(await namesOfThisTest(page)).toEqual([
		tagged("Ana", tag),
		tagged("Bruno", tag),
	]);
});

async function removeInAnotherTab(page: Page, name: string) {
	const other = await page.context().newPage();
	await other.goto("/owner");
	await row(other, name).getByRole("button", { name: "Remove" }).click();
	await row(other, name)
		.getByRole("button", { name: "Remove", exact: true })
		.click();
	await expect(row(other, name)).toHaveCount(0);
	await other.close();
}

test("renaming one removed in another tab says so and reloads the list", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await removeInAnotherTab(page, tagged("Ana", tag));
	await addThroughApi(page, tagged("Bruno", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	await page
		.getByLabel(`New name for ${tagged("Ana", tag)}`)
		.fill(tagged("Other", tag));
	await page.getByRole("button", { name: "Save" }).click();

	await expect(
		page.getByText("This professional no longer exists."),
	).toBeVisible();
	await expect(row(page, tagged("Bruno", tag))).toBeVisible();
	expect(await namesOfThisTest(page)).toEqual([tagged("Bruno", tag)]);
});

test("removing one removed in another tab says so and reloads the list", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await removeInAnotherTab(page, tagged("Ana", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove" })
		.click();
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove", exact: true })
		.click();

	await expect(
		page.getByText("This professional no longer exists."),
	).toBeVisible();
	expect(await namesOfThisTest(page)).toEqual([]);
});

// Added through the API with this page's cookie, so this page's list does
// not know of it until it reloads.
async function addThroughApi(page: Page, name: string) {
	const response = await page.request.post("/api/owner/professionals", {
		data: { name },
	});
	expect(response.status()).toBe(201);
}

test("after the session ended, add, rename and remove change nothing", async ({
	page,
}) => {
	const ended = "Your session has ended. Reload the page to sign in again.";
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await page.context().clearCookies();

	await add(page, tagged("Bruno", tag));
	await expect(page.getByText(ended)).toBeVisible();
	await expect(nameField(page)).toHaveValue(tagged("Bruno", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	await expect(page.getByText(ended)).toHaveCount(0);
	await page
		.getByLabel(`New name for ${tagged("Ana", tag)}`)
		.fill(tagged("Other", tag));
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText(ended)).toBeVisible();

	await page.getByRole("button", { name: "Cancel" }).click();
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove" })
		.click();
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Remove", exact: true })
		.click();
	await expect(page.getByText(ended)).toBeVisible();

	const names = await namesOnServer(page);
	expect(names.filter((name) => name.endsWith(tag))).toEqual([
		tagged("Ana", tag),
	]);
});

test("shows the loading line until the list answers", async ({ page }) => {
	await page.route("**/api/professionals", () => {
		// Never answered, so the list stays in its loading state.
	});
	await page.goto("/owner");

	await signIn(page);

	await expect(page.getByText("Loading professionals")).toBeVisible();
	await expect(page.getByText("No professionals yet.")).toHaveCount(0);
});

test("disables the buttons while an add is in flight", async ({ page }) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await page.route("**/api/owner/professionals", () => {
		// Never answered, so the add stays in flight.
	});

	await add(page, tagged("Bruno", tag));

	await expect(page.getByRole("button", { name: "Add" })).toBeDisabled();
	await expect(
		row(page, tagged("Ana", tag)).getByRole("button", { name: "Rename" }),
	).toBeDisabled();
});

test("disables Save and Cancel while a rename is in flight", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await page.route("**/api/owner/professionals/*", () => {
		// Never answered, so the rename stays in flight.
	});
	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();

	await page.getByRole("button", { name: "Save" }).click();

	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
	await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
});

test("disables Remove and Keep while a removal is in flight", async ({
	page,
}) => {
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await page.route("**/api/owner/professionals/*", () => {
		// Never answered, so the removal stays in flight.
	});
	const item = row(page, tagged("Ana", tag));
	await item.getByRole("button", { name: "Remove" }).click();

	await item.getByRole("button", { name: "Remove", exact: true }).click();

	await expect(
		item.getByRole("button", { name: "Remove", exact: true }),
	).toBeDisabled();
	await expect(item.getByRole("button", { name: "Keep" })).toBeDisabled();
});

test("says the server cannot be reached when the list fails", async ({
	page,
}) => {
	await page.route("**/api/professionals", (route) => route.abort());
	await page.goto("/owner");

	await signIn(page);

	const message = page.getByText("The server cannot be reached. Try again.");
	await expect(message).toBeVisible();
	await expectAbove(message, nameField(page));
});

test("keeps the list and what was typed when a change cannot reach the server", async ({
	page,
}) => {
	const unreachable = "The server cannot be reached. Try again.";
	await openOwner(page);
	await addAndWait(page, tagged("Ana", tag));
	await page.route("**/api/owner/professionals**", (route) => route.abort());

	await add(page, tagged("Bruno", tag));

	const message = page.getByText(unreachable);
	await expect(message).toBeVisible();
	await expectAbove(message, row(page, tagged("Ana", tag)));
	await expect(nameField(page)).toHaveValue(tagged("Bruno", tag));

	await row(page, tagged("Ana", tag))
		.getByRole("button", { name: "Rename" })
		.click();
	const field = page.getByLabel(`New name for ${tagged("Ana", tag)}`);
	await field.fill(tagged("Other", tag));
	await page.getByRole("button", { name: "Save" }).click();

	await expect(message).toBeVisible();
	await expect(field).toHaveValue(tagged("Other", tag));

	await page.getByRole("button", { name: "Cancel" }).click();
	const item = row(page, tagged("Ana", tag));
	await item.getByRole("button", { name: "Remove" }).click();
	await item.getByRole("button", { name: "Remove", exact: true }).click();

	await expect(message).toBeVisible();
	await expect(item.getByRole("button", { name: "Keep" })).toBeVisible();
});
