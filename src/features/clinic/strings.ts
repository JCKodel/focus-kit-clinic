import type { SetupRefusal } from "./rules.ts";

export const strings = {
	defaultTitle: "Clinic",
	notSetUp: "This clinic is not set up yet.",
};

// The setup command, run by the person who installs the app.
export const setupStrings = {
	name: "Clinic name: ",
	timeZone: "Time zone (IANA, e.g. Europe/Lisbon): ",
	slotMinutes: "Appointment length in minutes [30]: ",
	email: "Owner email: ",
	password: "Owner password (12 characters or more): ",
	passwordAgain: "Password again: ",
	done: (name: string) => `Clinic ${name} is set up. Sign in at /owner.`,
	inputEnded:
		"The answers ended before the setup was complete. Nothing was saved.",
};

export const refusalStrings: Record<SetupRefusal, string> = {
	ClinicAlreadySetUp: "The clinic is already set up.",
	InvalidClinicName: "The name must have from 1 to 80 characters.",
	UnknownTimeZone: "That is not an IANA time zone. Try one like Europe/Lisbon.",
	InvalidSlotMinutes:
		"The length must be a whole number from 5 to 240, in steps of 5.",
	InvalidEmail: "That is not an email address.",
	PasswordTooShort: "The password must have 12 characters or more.",
	PasswordsDiffer: "The two passwords differ. Type them again.",
};
