# Domain

Every page in `work/`, every identifier and every test uses these terms. A
new concept enters here first.

| Term | In code | Meaning |
|---|---|---|
| Clinic | `Clinic` | The one clinic the app serves; holds the time zone and the appointment length. |
| Owner | `Owner` | The person who runs the clinic and signs in. |
| Professional | `Professional` | Someone clients book with. |
| Weekly hours | `WeeklyHours` | A professional's recurring availability: a list of working periods. |
| Working period | `WorkingPeriod` | One weekday with a start and an end time, in clinic time. |
| Appointment length | `slotMinutes` | The fixed length of every appointment in the clinic; 30 by default. |
| Slot | `Slot` | A free interval of one professional, derived from weekly hours minus booked appointments. Never stored. |
| Booking window | `bookingWindowDays` | How far ahead a client can book: 30 days. |
| Client | `Client` | Whoever books: a name and a phone number, no account. |
| Appointment | `Appointment` | One client, one professional, one start time. |
| Status | `AppointmentStatus` | `booked` or `cancelled`. |
| Booking code | `bookingCode` | The short code shown after booking that, with the phone number, proves an appointment belongs to the client. |
| Book | `book` | Create an appointment in a free slot. |
| Cancel | `cancel` | Mark an appointment cancelled, which frees its slot. |
| Cancellation deadline | `cancellationDeadline` | 24 hours before an appointment starts. |
| Clinic time | `clinicTimeZone` | The IANA time zone every time is shown and reasoned in. |
| Slot taken | `SlotTaken` | The refusal when a booking asks for a time that is not free. |
| Too late to cancel | `CancellationTooLate` | The refusal of a cancellation after the deadline. |
| Outside hours | `OutsideWorkingHours` | The refusal of a booking at a time that is not a slot of the professional. |
| Outside window | `OutsideBookingWindow` | The refusal of a booking in the past or beyond the booking window. |
| Not found | `AppointmentNotFound` | The refusal when phone and booking code match no booked appointment. |
| Set up | `setUpClinic` | Create the clinic and the owner, once, from the setup command. |
| Session | `Session` | The proof, held in a cookie, that the owner signed in; lasts `sessionDays`. |
| Session length | `sessionDays` | How long a session lasts from sign-in: 30 days. |
| Sign in | `signIn` | The owner proves email and password and receives a session. |
| Sign out | `signOut` | End the owner's session. |
| Already set up | `ClinicAlreadySetUp` | The refusal of a second setup. |
| Not set up | `ClinicNotSetUp` | The answer when the clinic does not exist yet. |
| Invalid name | `InvalidClinicName` | The refusal of a clinic name that is blank or longer than 80 characters. |
| Unknown time zone | `UnknownTimeZone` | The refusal of a time zone that is not an IANA name. |
| Invalid length | `InvalidSlotMinutes` | The refusal of an appointment length that is not a whole number from 5 to 240 in steps of 5. |
| Invalid email | `InvalidEmail` | The refusal of an owner email without exactly one `@` with text on both sides, or with spaces. |
| Password too short | `PasswordTooShort` | The refusal of an owner password under 12 characters. |
| Passwords differ | `PasswordsDiffer` | The refusal when the password typed twice at setup does not match. |
| Sign-in refused | `SignInRefused` | The refusal of a sign-in whose email or password is wrong; it never says which. |
| Not signed in | `NotSignedIn` | The refusal of an owner request without a live session. |
| Add | `addProfessional` | The owner registers a new professional by name. |
| Rename | `renameProfessional` | The owner changes an active professional's name. |
| Remove | `removeProfessional` | The owner marks a professional removed: kept in the database, gone from every list, never active again. |
| Invalid professional name | `InvalidProfessionalName` | The refusal of a professional name that is blank or longer than 80 characters. |
| Name taken | `ProfessionalNameTaken` | The refusal of a name another active professional already has, ignoring case. |
| Professional not found | `ProfessionalNotFound` | The refusal of a rename or removal of a professional that does not exist or is removed. |

## Entities

* **Clinic:** name, `clinicTimeZone`, `slotMinutes`. Exactly one.
* **Owner:** email, password hash. Exactly one.
* **Session:** token hash, created instant, expiry instant. Belongs to the
  one owner.
* **Professional:** name, removal instant. Active while it has none;
  removed once it has one, and never active again.
* **WorkingPeriod:** professional, weekday, start, end, in clinic time. Start
  before end; periods of one professional on one weekday do not overlap.
* **Appointment:** professional, start instant, client name, client phone,
  booking code, status. The end is start plus `slotMinutes`.

## Invariants

1. Two booked appointments of the same professional never overlap.
2. An appointment starts at a slot: inside one of the professional's working
   periods, on the grid of `slotMinutes` counted from the period's start,
   ending no later than the period's end.
3. A booking starts after the current time and no more than
   `bookingWindowDays` ahead.
4. A cancellation succeeds only while the current time is at or before the
   cancellation deadline; otherwise it is refused with
   `CancellationTooLate`.
5. A cancelled appointment is kept with status `cancelled`, and its time is
   free again.
6. A client is identified by phone number and booking code together; the
   phone number is compared with digits only.
7. Instants are stored in UTC; weekdays, hours and dates are computed in the
   clinic time.
8. The clinic and the owner are set up once; a second setup is refused with
   `ClinicAlreadySetUp` and changes nothing.
9. A session is live while the current time is before its expiry; the owner
   email is compared trimmed and in lower case.
10. Two active professionals never share a name, compared trimmed and
    ignoring case. A removed professional's name is free again.
