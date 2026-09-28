import { err, ok, type Result } from "./result.ts";

const maxNameLength = 80;

// A name is stored trimmed, 1 to 80 characters. Lengths count characters,
// not UTF-16 units, so "é" or an emoji is one. First use: checkClinicName;
// second use: addProfessional and renameProfessional; third use:
// checkClientName.
export function checkName(raw: string): Result<string, "InvalidName"> {
	const name = raw.trim();
	if (name === "" || [...name].length > maxNameLength) {
		return err("InvalidName");
	}
	return ok(name);
}
