import { checkName } from "../../lib/name.ts";
import { err, ok, type Result } from "../../lib/result.ts";

export type Professional = { id: number; name: string };

export type NameRefusal = "InvalidProfessionalName" | "ProfessionalNameTaken";

// Two active professionals never share a name, compared trimmed and ignoring
// case (docs/03, rule 10). `others` holds only active professionals, so a
// removed one's name is free.
function checkFreeName(
	raw: string,
	others: Professional[],
): Result<string, NameRefusal> {
	const name = checkName(raw);
	if (!name.ok) return err("InvalidProfessionalName");
	const wanted = name.value.toLowerCase();
	const taken = others.some(
		(other) => other.name.trim().toLowerCase() === wanted,
	);
	return taken ? err("ProfessionalNameTaken") : name;
}

// The trimmed name to store.
export function addProfessional(
	raw: string,
	active: Professional[],
): Result<string, NameRefusal> {
	return checkFreeName(raw, active);
}

// Not found first; the professional's own row never makes its name taken.
export function renameProfessional(
	id: number,
	raw: string,
	active: Professional[],
): Result<string, "ProfessionalNotFound" | NameRefusal> {
	if (!active.some((professional) => professional.id === id)) {
		return err("ProfessionalNotFound");
	}
	return checkFreeName(
		raw,
		active.filter((professional) => professional.id !== id),
	);
}

// The removal instant: `now`, in ISO 8601.
export function removeProfessional(
	id: number,
	active: Professional[],
	now: Date,
): Result<string, "ProfessionalNotFound"> {
	if (!active.some((professional) => professional.id === id)) {
		return err("ProfessionalNotFound");
	}
	return ok(now.toISOString());
}

// Alphabetical, ignoring case and accents; ties by id.
export function sortByName(active: Professional[]): Professional[] {
	return [...active].sort(
		(a, b) =>
			a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
			a.id - b.id,
	);
}
