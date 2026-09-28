import type { ProfessionalsError } from "./useProfessionals.ts";

export const strings = {
	heading: "Professionals",
	loading: "Loading professionals",
	empty: "No professionals yet.",
	name: "Name",
	add: "Add",
	rename: "Rename",
	newName: (name: string) => `New name for ${name}`,
	save: "Save",
	cancel: "Cancel",
	remove: "Remove",
	keep: "Keep",
	confirmRemove: (name: string) =>
		`Remove ${name}? Clients will no longer see them.`,
};

export const errorStrings: Record<ProfessionalsError, string> = {
	InvalidProfessionalName: "Type a name of 1 to 80 characters.",
	ProfessionalNameTaken: "Another professional already has this name.",
	ProfessionalNotFound: "This professional no longer exists.",
	NotSignedIn: "Your session has ended. Reload the page to sign in again.",
	ServerUnreachable: "The server cannot be reached. Try again.",
};
