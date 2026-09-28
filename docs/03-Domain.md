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

## Entities

* **Clinic:** name, `clinicTimeZone`, `slotMinutes`. Exactly one.
* **Owner:** email, password hash. Exactly one.
* **Professional:** name, active or removed.
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
