# Product

## Purpose

A scheduling app for one neighbourhood clinic. Clients book and cancel their
own appointments with the clinic's professionals from their phones, without
creating an account. The owner registers the professionals and their weekly
hours, and sees who is coming. The app replaces the phone call and the paper
diary for the simple case: pick a professional, pick a free time, done.

## Audience

* **The client.** Anyone who wants an appointment. Has no account: gives a
  name and a phone number when booking. Uses a phone browser, often once.
* **The owner.** The person who runs the clinic. Signs in with an email and a
  password. Registers professionals, sets their weekly hours, looks at the
  schedule. Uses a phone or a desktop browser.

Every requirement names the side it serves. When the two sides conflict, the
client's simplicity wins unless the schedule's trustworthiness is at stake.

## Mechanics

1. The owner sets up the clinic once: its name, its time zone, the length of
   an appointment (30 minutes by default), and their own sign-in.
2. The owner registers the professionals and, for each one, the weekly hours:
   on which weekdays, from when to when.
3. The client opens the app, picks a professional, and sees the free times of
   the next 30 days, cut into slots of the clinic's appointment length.
4. The client picks a time, gives a name and a phone number, and books. The
   screen shows a short booking code, and the phone remembers the
   appointment.
5. Up to 24 hours before the appointment starts, the client can cancel it,
   from the remembered appointment or by typing the phone number and the
   booking code. The slot becomes free again. Later than that, cancelling is
   refused, and the message says why.
6. The owner sees the day's appointments, per professional.

All times are the clinic's local time.

## Rules

* A professional never has two appointments at the same time.
* An appointment starts at a slot: inside the professional's weekly hours,
  not in the past, at most 30 days ahead.
* A client can cancel their own appointment up to 24 hours before it starts.
  A later cancellation is refused with a message that says why.
* A cancelled appointment frees its slot.
* Times are the clinic's local time.

## Non-goals

* No payments.
* No notifications: no SMS, no email, no push.
* No medical records and no health data of any kind.
* No more than one clinic.
* No client accounts.
* No paid service to run it.

## Values

* **Simple.** The smallest thing that does the job. A new concept must pay
  its way.
* **Tested.** Every rule has a test.
* **Trustworthy schedule.** No double booking, no slot the owner did not open.
* **Phone first.** A client books in under a minute on a phone.
* **Private.** Only a name and a phone number about a client, nothing else.
* **Free to run.** Runs on a machine at the clinic or on any free host.

## Product questions

Every decision answers yes to all of these:

1. Does it serve one clinic, its owner or its clients, and does it say which?
2. Is it the simplest version that does the job?
3. Does every rule it adds or changes have a test?
4. Does it keep the schedule free of double bookings and of slots the owner
   did not open?
5. Does it store nothing about a client beyond a name and a phone number?
6. Does it still run with no paid service?
7. Does every text a user reads avoid the em dash?

## Open decisions

Nobody closes these alone. A delivery that needs one asks first.

* What happens to future appointments when the owner removes a professional
  or changes their weekly hours. Until decided: existing appointments stay.
* Whether the owner can cancel a client's appointment.
* What happens to future appointments when the owner changes the appointment
  length.
* How to stop one person from filling the schedule with fake bookings.
