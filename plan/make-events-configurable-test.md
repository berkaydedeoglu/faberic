---
goal: Add unit tests for the configurable events batch size and flush interval of the base agent.
version: 1
date_created: 2026-10-06
last_updated: 2026-10-06
owner: Porter Platform
---

# Make events configurable (tests)

## 1. Introduction

The base agent's `ConfigService.load` gains two environment variables:
`EVENTS_BATCH_SIZE` and `EVENTS_FLUSH_INTERVAL_MS`. This plan adds the unit
tests for them. This plan changes test code only.

Rules for you, the implementer:

- You are only an implementer. Do not design. Do not decide. Follow this plan.
- A runtime implementer agent works in parallel with you and edits
  `src/config/config.service.ts`. Do not write or change any runtime files.
  If the runtime change is not there yet when you finish, that is fine.
- Never run tests. A separate test runner agent does that.
- When you finish a task, tick its checkbox in this file: change `- [ ]` to
  `- [x]`. You may edit this plan file only to tick boxes and to add
  Implementation notes.
- Escape hatch: if reality contradicts this plan, act by size. Trivial and
  mechanical fixes are allowed: a typo in code you just wrote, a missing
  semicolon, an unused import, a formatting slip. Trivial means there is
  exactly one obvious answer and no design choice. Apply it, then record it
  in Implementation notes. Anything bigger — a missing file, a signature
  that does not match the contract, a decision the plan left open, a change
  to a file not listed in section 5 — means STOP. Do not improvise. Report
  status `input-required` with the exact problem and the exact evidence. The
  orchestration loop picks it up from there.

## 2. How to read this plan

- Requirements: what must be true when you finish. Check yourself against it.
- Implementation: numbered tasks in phases. Do them in order. Tasks marked
  [PARALLEL] can be done in any order relative to each other.
- Files: the exact files this plan touches. You may read other files, but do
  not write to files that are not listed here unless you record it in
  Implementation notes.
- Decisions and risks: locked choices. Do not deviate.

## 3. Requirements

1. R1 — `test/unit/config.service.test.ts` contains the new tests listed in
   Task 1, and no existing test is modified or deleted.
2. R2 — Every new assertion cites its source from the runtime plan (`S-R1`
   to `S-R4` below) as a comment-free mapping in this plan; the test code
   itself carries no source comments.
3. R3 — The repository typechecks with `bun run typecheck`.
4. R4 — Tests are written, but never executed by you.

### Public signature table (frozen)

| Signature | File | Behavior (one line) |
| --------- | ---- | ------------------- |
| `ConfigService.load(env: Env): AppConfig` | `src/config/config.service.ts` | reads `EVENTS_BATCH_SIZE` (int, default 50) into `events.batchSize` and `EVENTS_FLUSH_INTERVAL_MS` (int, default 10_000) into `events.flushIntervalMs`; invalid integer throws |
| Env var `EVENTS_BATCH_SIZE` | n/a | integer; default 50; maps to `config.events.batchSize` |
| Env var `EVENTS_FLUSH_INTERVAL_MS` | n/a | integer; default 10000; maps to `config.events.flushIntervalMs` |

This table is the contract between the parallel implementers. It is
byte-identical in the runtime plan. Derive every import, call, and expected
value only from this table.

Runtime plan requirements referred to below as sources:

- S-R1: defaults stay 50 and 10_000 when the env vars are absent.
- S-R2: `EVENTS_BATCH_SIZE` overrides `events.batchSize`.
- S-R3: `EVENTS_FLUSH_INTERVAL_MS` overrides `events.flushIntervalMs`.
- S-R4: invalid integer input throws `Invalid integer for <KEY>: "<value>"`.

## 4. Implementation

### Phase 1: Add the tests

#### Task 1: Extend the existing batching test
- [ ] Open `agent/agents/base/test/unit/config.service.test.ts`.
- [ ] Anchor: inside `describe("ConfigService.load", ...)`, find the test
      `it("batches events by 50 or every 10 seconds", ...)` (it asserts
      `ConfigService.load({}).events` equals
      `{ batchSize: 50, flushIntervalMs: 10_000 }`). Do not modify this
      test; it already covers S-R1.
- [ ] Immediately after that closing `});` of the anchored test, add a new
      test with the locked title `"reads events batching from env vars"`.
      Behavior: `ConfigService.load({ EVENTS_BATCH_SIZE: "200", EVENTS_FLUSH_INTERVAL_MS: "5000" }).events`
      must equal `{ batchSize: 200, flushIntervalMs: 5000 }`. (Sources:
      S-R2, S-R3.)
- [ ] Immediately after the test you just added, add a second test with the
      locked title `"rejects invalid events env vars"`. Behavior:
      `ConfigService.load({ EVENTS_BATCH_SIZE: "abc" })` throws an error
      whose message contains `Invalid integer for EVENTS_BATCH_SIZE`;
      `ConfigService.load({ EVENTS_FLUSH_INTERVAL_MS: "1.5" })` throws an
      error whose message contains `Invalid integer for EVENTS_FLUSH_INTERVAL_MS`.
      (Source: S-R4.)
- [ ] Style: match the neighboring tests — `expect(...).toEqual(...)` for
      values, `expect(() => ...).toThrow("...")` for errors, no new imports
      (`ConfigService` is already imported at the top of the file).

### Phase 2: Verify

#### Task 2: Typecheck and semantic review
- [ ] From `agent/agents/base`, run: `bun run typecheck`
- [ ] Do the semantic review described in section 7.

## 5. Files

| Path | Action | Reason |
| ---- | ------ | ------ |
| `agent/agents/base/test/unit/config.service.test.ts` | edit | add the two new tests |

## 6. Decisions and risks

- The env var contract comes only from the frozen table in section 3. If the
  runtime file disagrees with the table when you read it, the table wins;
  report the mismatch as `input-required` instead of adapting the tests.
- The pre-existing `"batches events by 50 or every 10 seconds"` test must not
  be touched. Locked.
- Risk: the runtime edit may not exist yet when you finish (parallel work).
  Expected. Do not create or edit runtime files, do not run the tests.

## 7. Lint and semantic review

- Lint command: `bun run typecheck` (repository: `agent/agents/base`). There
  is no dedicated linter in this project; `tsc --noEmit` is the lint gate.
- Expected result: exit code 0, no errors. Warnings are not failures; this
  command prints nothing on success. Note: this plan adds no new imports and
  no new types, so the typecheck passes even if the runtime edit is not
  applied yet.
- If lint fails: fix only trivial syntax in your own new code (typo, missing
  semicolon, unused import, formatting — exactly one obvious answer), then
  re-run once. If it still fails, or the cause is anything else (type
  mismatch, missing symbol, contract mismatch), STOP. Do not fix beyond
  trivial syntax. Report status `input-required` with the exact error
  output.
- Semantic review: re-read your full diff. Check every expected value
  against the frozen table in section 3. Confirm both new tests sit right
  after the anchored test and carry the locked titles. Confirm no existing
  test changed. Only then tick the last task.

## 8. Expected output

Unless your system prompt or the requester explicitly asks for a different
format (for example JSON), when done, reply to the requester in the
requester's language with exactly this shape. If another format is required,
keep the same content (tasks applied, deviations, lint, review) inside that
format.

"I completed the make-events-configurable-test plan.
Tasks applied:
- [x] Extend the existing batching test
- [x] Typecheck and semantic review
No work outside the plan. / I changed `<thing>` because `<reason>` and
recorded it in Implementation notes.
Lint checked with: `bun run typecheck`. Semantic review complete."

If you had to stop, report instead: status `input-required`, the task you
stopped at, and the exact evidence.

## Implementation notes

(Empty. Fill only if you applied a trivial fix outside the plan.)
