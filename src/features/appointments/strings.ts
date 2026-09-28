import type { Weekday } from "../weeklyHours/rules.ts";
import type { CancelError } from "./api.ts";
import { wallTimeOf, weekdayOf } from "./clinicTime.ts";
import type { BookingError } from "./useBooking.ts";

const weekdayNames: Record<Weekday, string> = {
	1: "Mon",
	2: "Tue",
	3: "Wed",
	4: "Thu",
	5: "Fri",
	6: "Sat",
	7: "Sun",
};

const monthNames = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

// A clinic date, "YYYY-MM-DD", as "Tue 29 Sep".
export function dayLabel(date: string): string {
	const day = Number(date.slice(8, 10));
	const month = monthNames[Number(date.slice(5, 7)) - 1];
	return `${weekdayNames[weekdayOf(date)]} ${day} ${month}`;
}

// Minutes from midnight as "09:30".
export function timeLabel(minutes: number): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// "Tue 29 Sep at 09:30 with Ana Lima", in clinic time.
export function summary(
	startsAt: string,
	timeZone: string,
	professionalName: string,
): string {
	const { date, minutes } = wallTimeOf(new Date(startsAt), timeZone);
	return `${dayLabel(date)} at ${timeLabel(minutes)} with ${professionalName}`;
}

export const strings = {
	heading: "Book an appointment",
	loading: "Loading",
	empty: "No professionals yet.",
	bookWith: (name: string) => `Book with ${name}`,
	back: "Back",
	noFreeTimes: "No free times in the next 30 days.",
	name: "Your name",
	phone: "Phone number",
	book: "Book",
	tooLateToCancel:
		"This appointment starts in less than 24 hours and cannot be cancelled in the app.",
	booked: "Booked",
	yourCode: "Your booking code",
	keepCode: (digits: string) =>
		`Keep this code. With the phone number ${digits}, it identifies your appointment.`,
	done: "Done",
	tryAgain: "Try again",
	remembered: "Your appointments",
	cancel: "Cancel",
	confirmCancel: "Cancel this appointment?",
	yesCancel: "Yes, cancel",
	keepIt: "Keep it",
	noLongerCancellable: "Can no longer be cancelled in the app.",
	cancelledLine: (line: string) =>
		`Cancelled: ${line}. The time is free again.`,
	noLongerBooked: "This appointment is no longer booked.",
	cancelWithCode: "Cancel with a booking code",
	cancelHeading: "Cancel an appointment",
	bookingCode: "Booking code",
	cancelAppointment: "Cancel appointment",
	cancelled: "Cancelled",
	timeFreeAgain: "The time is free again.",
	// A no-break space keeps "Code" and the code on one line.
	rememberedLine: (line: string, code: string) => `${line} · Code ${code}`,
};

export const errorStrings: Record<BookingError, string> = {
	InvalidClientName: "Type a name of 1 to 80 characters.",
	InvalidPhoneNumber: "Type a phone number with 6 to 15 digits.",
	SlotTaken: "This time is no longer free. Pick another.",
	ProfessionalNotFound: "This professional is no longer available.",
	ServerUnreachable: "The server cannot be reached. Try again.",
};

export const cancelErrorStrings: Record<CancelError["code"], string> = {
	AppointmentNotFound:
		"No booked appointment matches this phone number and code.",
	CancellationTooLate:
		"Appointments can be cancelled up to 24 hours before they start. This one can no longer be cancelled in the app.",
	ServerUnreachable: errorStrings.ServerUnreachable,
};
