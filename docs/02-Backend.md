# Backend

The server holds every rule the client must not be trusted with: no double
booking, the 24 hour cancellation limit, the booking window, and who may
change the clinic. The client reuses the same use cases only for display
(docs/01).

Each part below is created by the delivery named beside it, which writes
its exact contract on its page and updates this document.

## Schema

| Table | Holds | Created by |
|---|---|---|
| `clinic` | the one clinic: name, time zone, appointment length | `clinic-setup` |
| `owner` | the one owner: email, password hash | `clinic-setup` |
| `session` | owner sessions | `clinic-setup` |
| `professional` | name, active or removed | `professionals` |
| `working_period` | professional, weekday, start and end wall clock time | `weekly-hours` |
| `appointment` | professional, start instant, client name, client phone, booking code, status | `book-appointment` |

A unique index on `appointment (professional_id, starts_at)` over booked
appointments is the last guard against two bookings racing for one slot.

## Access rules

* The client side needs no session. It may read professionals and free
  slots, book, and cancel an appointment it proves with phone and booking
  code.
* Everything else needs the owner's session.

## Routes

Listed here as each delivery creates them.
