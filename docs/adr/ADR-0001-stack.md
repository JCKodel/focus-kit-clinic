# ADR-0001: TypeScript, React PWA, Node server, SQLite, no paid service

**Date:** 2026-09-28

## Context

The app serves one small clinic. It must open in a phone browser with no
install, hold rules a phone cannot be trusted with, and cost nothing to run:
on a machine at the clinic or on any free host. The code is written mostly by
an agent, which needs to check its own work.

## Decision

* TypeScript in `strict` mode everywhere.
* A React PWA built with Vite, for the client side and the owner side.
* A small Node server with Hono, holding every rule.
* One SQLite file through `node:sqlite`, the driver that ships with Node.
* Owner sign-in written in the project: scrypt from `node:crypto` and a
  session cookie.
* No paid service.

TypeScript and React because they are the language and library with the most
public code the agent learned from; types and tests let it verify itself. A
hosted backend service was considered and set aside: rules would live in SQL
functions tested in a second language, and it adds a dependency on a
provider.

## Consequences

* One language, one project, one file of data; backup is a copy.
* The server needs a host that keeps a file between restarts.
* Hono, `node:sqlite` and the sign-in were chosen by the agent under "your
  call"; each can be replaced by a delivery that says why, amending this ADR.
