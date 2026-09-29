# Queue

`[ ]` not yet defined · `[>]` defined, `work/<slug>.md` exists · `[x]` done,
page in `work/done/`.

## Milestone 1: a client books and cancels

When it closes, the owner can register professionals and their weekly hours,
a client can book a free slot, and a client can cancel up to 24 hours before.

```
[x] skeleton             empty PWA and server in one project, npm run verify, first screenshot
[x] clinic-setup         a setup command creates the clinic and the owner; the owner signs in and out
[x] professionals        the owner registers, renames and removes professionals
[x] weekly-hours         the owner sets each professional's weekly hours
[x] e2e-database-busy    verify never fails because a test writes to the e2e database while the server writes (SQLITE_BUSY)
[x] book-appointment     a client sees free slots for 30 days and books with name and phone
[x] cancel-appointment   a client cancels up to 24 hours before, or is told why not
```

## Milestone 2: what the review of milestone 1 found

When it closes, every confirmed finding of the milestone 1 review is
settled: setup accepts every IANA time zone name, a refused booking keeps
its message through a failed reload, docs/02 renders whole, and the code
repeated across features has one shared copy.

```
[ ] time-zone-names      setup accepts every IANA name the runtime knows, such as US/Eastern and Etc/UTC, as docs/03 says
[ ] slot-taken-retry     after a refused booking whose slot reload fails, "Try again" keeps the "no longer free" message and the chosen date
[ ] routes-table         the Routes table of docs/02 renders whole, with the slots and appointments routes as rows
[ ] route-errors         one shared databaseFailed and one shared notFound answer; the first copies are in session.server.ts and weeklyHours/route.server.ts
[ ] minutes-of           one shared "HH:MM" parser; the first copy is in weeklyHours/rules.ts, the second in appointments/rules.ts
```

## Milestone 3: the owner runs the day

When it closes, the owner can record a professional's absences, which remove
their slots, and sees the day's appointments per professional; and the app
runs outside the developer's machine with no paid service.

```
[ ] absences             the owner records a professional's absences, and their slots disappear
[ ] owner-schedule       the owner sees the day's appointments per professional
[ ] owner-password       a command sets a new owner password, for the owner who forgot it
[ ] sign-in-limit        repeated wrong sign-ins are slowed down, before the app is public
[ ] install              web manifest with the clinic's name and icon, so a phone offers "Add to home screen"
[ ] fake-bookings        decide (docs/00 open decision) and build how one person is kept from filling the schedule, before the app is public
[ ] deploy               the app runs on a clinic machine or a free host, with a backup of the data
```
