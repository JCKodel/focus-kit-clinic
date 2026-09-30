import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../lib/result.ts";
import {
	add,
	addStarted,
	close,
	hoursReported,
	initialProfessionalsState,
	load,
	openHours,
	openRemove,
	openRename,
	type ProfessionalsRepositories,
	type ProfessionalsState,
	remove,
	removeStarted,
	rename,
	renameStarted,
	typeAddName,
	typeRename,
} from "./professionalsEvents.ts";

function unexpected(): never {
	throw new Error("not called in this test");
}

function fake(
	repositories: Partial<ProfessionalsRepositories>,
): ProfessionalsRepositories {
	return {
		fetchProfessionals: unexpected,
		postProfessional: unexpected,
		patchProfessional: unexpected,
		deleteProfessional: unexpected,
		...repositories,
	};
}

// A report that needs no repository answers an update at once, not a promise.
function atOnce(answer: ReturnType<typeof hoursReported>) {
	if (typeof answer !== "function") throw new Error("answered a promise");
	return answer;
}

const unreachable = err({ code: "ServerUnreachable" } as const);
const gone = err({ code: "ProfessionalNotFound" } as const);

const ana = { id: 1, name: "Ana Lima" };
const bea = { id: 2, name: "Bea Reis" };
const rui = { id: 3, name: "Rui Costa" };

const listed: ProfessionalsState = {
	...initialProfessionalsState,
	loading: false,
	list: [ana, rui],
};

describe("the first load", () => {
	it("gives the list without touching a name typed meanwhile", async () => {
		const update = await load(
			fake({ fetchProfessionals: async () => ok([ana, rui]) }),
		);

		expect(update(typeAddName(initialProfessionalsState, "Bea"))).toEqual({
			...listed,
			addName: "Bea",
		});
	});

	it("gives ServerUnreachable", async () => {
		const update = await load(
			fake({ fetchProfessionals: async () => unreachable }),
		);

		expect(update(initialProfessionalsState)).toEqual({
			...initialProfessionalsState,
			loading: false,
			error: "ServerUnreachable",
		});
	});
});

describe("adding", () => {
	it("is busy in flight and clears the old messages", () => {
		expect(
			addStarted({
				...listed,
				error: "ServerUnreachable",
				addError: "ProfessionalNameTaken",
			}),
		).toMatchObject({ busy: true, error: undefined, addError: undefined });
	});

	it("inserts the professional in name order and empties the field", async () => {
		const postProfessional = vi.fn(async () => ok(bea));
		const started = addStarted(typeAddName(listed, "Bea Reis"));

		const update = await add("Bea Reis", fake({ postProfessional }));

		expect(postProfessional).toHaveBeenCalledWith("Bea Reis");
		expect(update(started)).toMatchObject({
			busy: false,
			addName: "",
			list: [ana, bea, rui],
		});
	});

	it("puts a name refusal in addError", async () => {
		const update = await add(
			"Ana Lima",
			fake({
				postProfessional: async () =>
					err({ code: "ProfessionalNameTaken" } as const),
			}),
		);

		expect(update(addStarted(listed))).toMatchObject({
			busy: false,
			addError: "ProfessionalNameTaken",
			error: undefined,
		});
	});

	it("puts any other refusal in error", async () => {
		const update = await add(
			"Bea Reis",
			fake({
				postProfessional: async () => err({ code: "NotSignedIn" } as const),
			}),
		);

		expect(update(addStarted(listed))).toMatchObject({
			busy: false,
			addError: undefined,
			error: "NotSignedIn",
		});
	});
});

describe("renaming", () => {
	const opened = openRename(listed, rui);

	it("opens the row with the name, and types in it", () => {
		expect(opened.row).toEqual({ id: 3, mode: "rename", name: "Rui Costa" });
		expect(typeRename(opened, "Abel Costa").row).toEqual({
			id: 3,
			mode: "rename",
			name: "Abel Costa",
		});
		expect(typeRename(listed, "Abel")).toBe(listed);
	});

	it("replaces the professional in name order and closes the row", async () => {
		const abel = { id: 3, name: "Abel Costa" };
		const patchProfessional = vi.fn(async () => ok(abel));

		const update = await rename(3, "Abel Costa", fake({ patchProfessional }));

		expect(patchProfessional).toHaveBeenCalledWith(3, "Abel Costa");
		expect(update(renameStarted(opened))).toMatchObject({
			busy: false,
			row: undefined,
			list: [abel, ana],
		});
	});

	it("puts a name refusal in the open row", async () => {
		const update = await rename(
			3,
			"Ana Lima",
			fake({
				patchProfessional: async () =>
					err({ code: "ProfessionalNameTaken" } as const),
			}),
		);

		expect(update(renameStarted(opened))).toMatchObject({
			busy: false,
			row: {
				id: 3,
				mode: "rename",
				name: "Rui Costa",
				error: "ProfessionalNameTaken",
			},
		});
	});
});

describe("removing", () => {
	it("drops the professional and closes the row", async () => {
		const deleteProfessional = vi.fn(async () => ok(true as const));
		const opened = openRemove(listed, ana);
		expect(opened.row).toEqual({ id: 1, mode: "remove" });

		const update = await remove(1, fake({ deleteProfessional }));

		expect(deleteProfessional).toHaveBeenCalledWith(1);
		expect(update(removeStarted(opened))).toMatchObject({
			busy: false,
			row: undefined,
			list: [rui],
		});
	});
});

describe("a professional removed meanwhile", () => {
	const reloaded = { list: [ana], busy: false, row: undefined };

	it("on a rename, reloads the list and says so", async () => {
		const update = await rename(
			3,
			"Abel Costa",
			fake({
				patchProfessional: async () => gone,
				fetchProfessionals: async () => ok([ana]),
			}),
		);

		expect(update(renameStarted(openRename(listed, rui)))).toMatchObject({
			...reloaded,
			error: "ProfessionalNotFound",
		});
	});

	it("on a removal, reloads the list and says so", async () => {
		const update = await remove(
			3,
			fake({
				deleteProfessional: async () => gone,
				fetchProfessionals: async () => ok([ana]),
			}),
		);

		expect(update(removeStarted(openRemove(listed, rui)))).toMatchObject({
			...reloaded,
			error: "ProfessionalNotFound",
		});
	});

	it("reported by the hours editor, reloads the list and says so", async () => {
		const saving = atOnce(hoursReported("saving", fake({})))(
			openHours(listed, rui),
		);
		const answer = hoursReported(
			"ProfessionalNotFound",
			fake({ fetchProfessionals: async () => ok([ana]) }),
		);
		expect(answer).toBeInstanceOf(Promise);
		const update = await answer;

		expect(update(saving)).toMatchObject({
			...reloaded,
			error: "ProfessionalNotFound",
		});
	});

	it("keeps the old list when the reload fails", async () => {
		const update = await remove(
			3,
			fake({
				deleteProfessional: async () => gone,
				fetchProfessionals: async () => unreachable,
			}),
		);

		expect(update(removeStarted(listed))).toMatchObject({
			list: [ana, rui],
			error: "ProfessionalNotFound",
		});
	});
});

describe("the hours editor's reports", () => {
	const opened = openHours({ ...listed, error: "ServerUnreachable" }, rui);

	it("opens the hours row and clears the message", () => {
		expect(opened).toMatchObject({
			row: { id: 3, mode: "hours" },
			error: undefined,
		});
	});

	const saving = atOnce(hoursReported("saving", fake({})))(opened);

	it("saving is busy, at once", () => {
		expect(saving).toMatchObject({ busy: true });
	});

	it("saved closes the row, at once", () => {
		const update = atOnce(hoursReported("saved", fake({})));

		expect(update(saving)).toMatchObject({ busy: false, row: undefined });
	});

	it("failed keeps the row open, at once", () => {
		const update = atOnce(hoursReported("failed", fake({})));

		expect(update(saving)).toMatchObject({
			busy: false,
			row: { id: 3, mode: "hours" },
		});
	});

	it("NotSignedIn shows the code above the list, at once", () => {
		const update = atOnce(hoursReported("NotSignedIn", fake({})));

		expect(update(saving)).toMatchObject({
			busy: false,
			error: "NotSignedIn",
			row: { id: 3, mode: "hours" },
		});
	});

	it("close closes the row and clears the message", () => {
		expect(close({ ...opened, error: "NotSignedIn" })).toMatchObject({
			row: undefined,
			error: undefined,
		});
	});
});
