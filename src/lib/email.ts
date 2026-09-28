// The owner's email is compared trimmed and in lower case (docs/03, rule 9).
// First use: checkOwnerEmail at setup; second use: sign-in.
export function normaliseEmail(raw: string): string {
	return raw.trim().toLowerCase();
}
