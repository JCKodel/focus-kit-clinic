# ADR-0004: Clients without an account, proven by a booking code

**Date:** 2026-09-28

## Context

Clients book with a name and a phone number and have no account. They must
still cancel only their own appointments. With no notifications, nothing can
be sent to them after booking.

## Decision

After booking, the screen shows a short booking code (6 characters from an
alphabet without look alike characters), and the phone remembers the
appointment in local storage. To cancel, the client taps the remembered
appointment or types phone number and booking code; the server checks both.

## Consequences

* A client who loses the code and the phone's memory cannot cancel in the
  app; they call the clinic.
* Anyone can book, which leaves fake bookings open (docs/00, open
  decisions).
* Client accounts stay a non-goal; revisiting this means changing docs/00.
