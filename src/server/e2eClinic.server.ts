import { tmpdir } from "node:os";
import { join } from "node:path";

// For Playwright: the clinic the run sets up with `npm run setup` before the
// server starts, and the throwaway database it lives in. Read by
// playwright.config.ts and the *.e2e.ts files, never by client code.
export const e2eDatabasePath = join(
	tmpdir(),
	"focus-kit-clinic-e2e",
	"clinic.sqlite",
);

export const e2eClinic = {
	name: "Clinica Sol",
	timeZone: "Europe/Lisbon",
	slotMinutes: "",
	email: "owner@example.com",
	password: "correct horse battery",
};
