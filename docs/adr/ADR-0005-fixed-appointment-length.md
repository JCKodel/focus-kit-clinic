# ADR-0005: One fixed appointment length for the whole clinic

**Date:** 2026-09-28

## Context

Appointments could have a length per clinic, per professional or per
service. The product values simplicity.

## Decision

One length for the whole clinic, `slotMinutes`, 30 by default, set at clinic
setup. Weekly hours are cut into slots of that length, counted from the start
of each working period. There are no services.

## Consequences

* Slots of one professional never partly overlap, so a unique index on
  professional and start time guards against double booking.
* A clinic whose professionals need different lengths is not served. A length
  per professional or services would amend this ADR and docs/03.
* Changing the length with future appointments booked is an open decision
  (docs/00).
