# Architecture

## In one sentence

A React PWA and a small Node server in one TypeScript project, organized by
feature with FOCUS, where every business rule is a pure function both sides
import and the server enforces, over one SQLite file.

## Stack

| Piece | Choice | Why, when there was an alternative |
|---|---|---|
| Language | TypeScript, `strict` | The language with the most public code; types let the agent check its own work. |
| Client | React PWA, built with Vite | Opens in any phone browser, no install; React is the library the agent knows best. |
| Server | Node `>=24` with Hono and `@hono/node-server` | Small, TypeScript first, runs anywhere Node runs. Node runs the server's `.ts` files directly (type stripping), so the server has no build step; imports carry the `.ts` extension and only erasable syntax is allowed (`erasableSyntaxOnly`). |
| Database | SQLite through `node:sqlite` | One file, no server to run, backup is a copy. The driver ships with Node, so no native package to build on a free host. |
| Owner sign-in | Password hashed with `node:crypto` scrypt, session in an httpOnly cookie | One owner; a page of code is simpler than an auth library or service. |
| Tests | Vitest for units and repositories, Playwright for screens | See docs/04. |
| Style | Biome | Formats and lints in one tool. |

No paid service anywhere (ADR-0001).

## How the code is organized: FOCUS

FOCUS whole (ADR-0002): four pieces, flow in one direction, errors as values,
vertical slices.

| Piece | Does | Forbids |
|---|---|---|
| View | fires events, renders state | business rules, data access |
| Orchestrator | converts event to state, fetches, calls use cases, publishes state | deciding rules, persisting |
| Use Case | the only place for business rules; pure; takes data, returns a Result | IO, framework, domain exception |
| Repository | fetch and save; the only place an infra exception becomes a Result | business rules |

In this stack a slice is one folder per feature:

```
src/
  features/<feature>/
    rules.ts               Use Cases: pure, imported by client and server
    rules.test.ts
    route.server.ts        server Orchestrator: a Hono route
    repository.server.ts   server Repository: SQL
    repository.server.test.ts
    api.ts                 client Repository: fetch, network failure becomes a Result
    <name>Events.ts        client Orchestrator: the hook's state, its initial
                           value, and what each event does, as plain functions
    <name>Events.test.ts
    use<Feature>.ts        client Orchestrator: a React hook publishing one state
    <Feature>View.tsx      View
    strings.ts             every text the user reads in this feature
  app/                     client shell: entry, path switch, layout
  server/                  server shell: entry, setup command, database,
                           migrations, password, session, the error
                           answers routes share
  lib/                     what two features already share: result.ts,
                           email.ts (trim and lower case the owner email),
                           name.ts (trim, 1 to 80 characters: clinic,
                           professional and client names),
                           request.ts (fetch to Result, for every api.ts),
                           id.ts (the positive whole id in a route path),
                           time.ts (minutesOf: a clinic wall time "HH:MM"
                           as minutes since midnight),
                           update.ts (Update and Started: the answer of an
                           event and of a starter that decides whether to
                           send)
```

* The app shell has no router library: `src/app/main.tsx` shows the owner
  screen when `location.pathname` is `/owner` and the home page otherwise.
* Server routes that need the database are functions of it
  (`clinicRoute(db)`), so Vitest drives them through Hono's `app.request`
  against an in-memory SQLite (`testDatabase.server.ts`).

* A client orchestrator is split in two. `<name>Events.ts` holds every
  event as a plain function, in one of the shapes of "Event shapes"
  below.
  The event functions receive their repositories as a parameter, the real
  ones by default (`<name>Repositories`), and the clock as `now`: no
  function there reads it. `use<Feature>.ts` keeps only the React part:
  it holds the state, publishes the in-flight state and the update, and
  keeps what holds state across renders (stale-answer guards,
  subscriptions such as `onRememberedChange`). A hook imports no `api.ts`,
  `rules.ts` or `remembered.ts`, except `onRememberedChange`.
* A slice has only the files it needs. A file appears when it pays its way.
* Client code never imports a `*.server.ts` file.
* The server enforces every rule. The client imports the same use case only
  to decide what to show (for example, whether the cancel button appears), so
  a rule is written once and tested once.
* Use cases take the current time as a parameter. No use case reads the
  clock.
* Code moves to `lib/` on its second concrete use, not before.

### Event shapes

Every exported function of a `<name>Events.ts` file is an event of one
shape below, or a value worked out for the view, which is not an event:
`daysOf`, `tooLateToCancel` and `linesOf`. `S` is the hook's state. The
repositories come last, the real ones by default; `now` is there only
when a use case or a repository needs the clock. The eight events files
were written together by `orchestrator-tests`, in the order `booking`,
`cancel`, `remembered`, `professionals`, `weeklyHours`, `owner`,
`clinic`, `health`; that order decides which is the first occurrence. A
new event takes one of these shapes; a delivery that needs another adds
it here, with its first occurrence.

1. **Event with no call.** `(state: S, ...inputs) => S`. Used when the
   event only changes what is on screen: typing, picking, opening,
   closing. The hook publishes it as an update,
   `setState((s) => event(s, ...inputs))`. First occurrence: `pickDay` in
   `bookingEvents.ts`. When the answer does not depend on the state, the
   event takes none, `(...inputs) => S`, and the hook publishes the
   value: first occurrence `open` and `close` in `cancelEvents.ts`.
2. **Call with a Started and an update.**
   `<event>Started(state: S, ...inputs): S` gives the in-flight state, and
   `async <event>(...inputs, now?, repositories): Promise<Update<S>>`
   makes the call and resolves to an update, so what was typed meanwhile
   survives. Used when an action calls a repository and nothing is
   checked before sending. The hook publishes the in-flight state as an
   update, then the answer. First occurrence: `submitStarted` and
   `submit` in `cancelEvents.ts`. When the in-flight state does not
   depend on the state, the starter takes none and the hook publishes the
   value: `submitSignInStarted` and `submitSignOutStarted` in
   `ownerEvents.ts`.
3. **Load at mount.** `async <event>(repositories): Promise<Update<S>>`,
   with no Started. Used for the first read of a screen: the in-flight
   state is the initial state, `initial<Name>State`, so nothing is
   published before the call. The hook runs it in a `useEffect` and drops
   the answer when its `active` flag says the screen is gone. First
   occurrence: `load` in `professionalsEvents.ts`. The booking's first
   load is shape 5, and the weekly hours' is shape 6.
4. **Starter that decides whether to send.**
   `<event>Started(state: S): Started<S>`, followed by the call. Used when
   a rule is checked on the client before sending, to show its message
   beside the field. It checks the state the person acted on, `send` says
   at once whether to call, `update` writes the answer of the check onto
   the current state, and the call sends the state that was checked.
   First occurrence: `submitStarted` in `bookingEvents.ts`; the second is
   `saveStarted` in `weeklyHoursEvents.ts`, so the shape is declared
   once, as `Started` in `src/lib/update.ts`.
5. **Answer that may be the next event.**
   `async <event>(...inputs, now?, repositories): Promise<BookingOutcome>`,
   where `BookingOutcome` is `{ update: Update<BookingState> }` or a
   `BookingNext`, which names a call and its inputs: `loadProfessionals`,
   `loadSlots` or `submit`. Used when a refusal must show a step loading
   again (after `SlotTaken` or `ProfessionalNotFound`), which one update
   cannot publish. The hook runs a `BookingNext` as any event: its
   Started, then the call under a new `latest` number, then the update or
   the next event. `retryOf(state): BookingNext | undefined` names the
   call "Try again" repeats. Only occurrence: `bookingEvents.ts`.
6. **Answer that carries a report.**
   `async <event>(...inputs, repositories): Promise<WeeklyHoursAnswer>`,
   where `WeeklyHoursAnswer` is
   `{ update: Update<WeeklyHoursState>; report?: WeeklyHoursAnswerReport }`.
   Used when an editor inside another section tells that section what
   happened, because the section holds the busy state, the open row and
   the messages. The hook publishes the update, then passes the report to
   the section; before a save it sends, it reports `saving` itself. The
   section takes a `WeeklyHoursReport`, which is a
   `WeeklyHoursAnswerReport` or `saving`; an answer cannot carry `saving`,
   which would leave the section busy. Only occurrence: `load` and `save`
   in `weeklyHoursEvents.ts`.
7. **Report received.**
   `<event>(report, repositories): Update<S> | Promise<Update<S>>`. Used
   by the section that receives shape 6's report: the answer is an update
   at once, so a button disables in the same render, or a promise when
   the report needs a call. The hook publishes a function at once and a
   promise when it resolves. Only occurrence: `hoursReported` in
   `professionalsEvents.ts`.
8. **Call that does not wait.** `(state, now, repositories) => S`, or
   `(now, repositories) => S` for the first state. Used when the
   repository is local storage, which answers at once, so there is no
   in-flight state. The hook gives `initialRememberedState` to `useState`
   and publishes `reread` as an update on each `onRememberedChange`. Only
   occurrence: `rememberedEvents.ts`.

## How data is accessed

Only repositories touch SQLite; only `api.ts` files call the server; only
`appointments/remembered.ts` touches the phone's local storage (key
`appointments`): it remembers a booked appointment and forgets a cancelled
one, dropping past ones on each write, and a failure is a `Result` like any
other. The
server exposes the JSON routes listed in docs/02. Migrations are plain SQL
files in `src/server/migrations/`, applied in order at start and recorded in
`schema_migration`; docs/02 holds the rules of the runner.

Times are stored as UTC instants. Weekly hours are stored as weekday and
wall clock times in the clinic's time zone. Slots are computed, never stored.

## How errors travel

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
```

1. A repository catches the database exception and returns a Result with an
   infrastructure error: its SQL runs inside `query` from
   `src/server/database.server.ts`, which gives `DatabaseFailed`; writes
   that go together run inside `transaction`, which also rolls back.
2. A use case returns a Result with a domain error from docs/03 (for example
   `SlotTaken`, `CancellationTooLate`). It never throws.
3. The route maps the error to an HTTP status and a body
   `{ "error": { "code": "<Code>" } }`.
4. `api.ts` turns a non-2xx response or a network failure into a Result,
   through `request` in `src/lib/request.ts`: each call names the statuses
   it expects as refusals (`404` is `ClinicNotSetUp`) and reads the body;
   anything else is `ServerUnreachable`.
5. The hook publishes a state that holds the error; the view shows the
   message from `strings.ts` for that code.

`throw` is never used as flow.

## Environments

| Name | What runs there | Command |
|---|---|---|
| local | client and server on the developer's machine, a local SQLite file (`data/clinic.sqlite`) | `npm install`, `npm run setup` once, then `npm run dev`: server on port 3000, Vite on 5173 forwarding `/api/*`; the owner signs in at `/owner` |
| production | a machine at the clinic or a free host | created by the `deploy` delivery |

## Tried and removed on purpose

Nothing yet.
