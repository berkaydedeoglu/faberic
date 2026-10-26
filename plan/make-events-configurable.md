---
goal: Make the base agent's events batch size and flush interval configurable via environment variables.
version: 1
date_created: 2026-10-06
last_updated: 2026-10-06
owner: Porter Platform
---

# Make events configurable (runtime)

## 1. Introduction

The base agent currently hardcodes `events.batchSize` (50) and
`events.flushIntervalMs` (10_000) in `ConfigService.load`. This plan makes
both configurable through environment variables while keeping the current
values as defaults. This plan changes runtime code only.

Rules for you, the implementer:

- You are only an implementer. Do not design. Do not decide. Follow this plan.
- A tester agent works in parallel with you. Do not write or change any test
  files. The tester edits `test/unit/config.service.test.ts` on their own.
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

1. R1 — `ConfigService.load({})` returns `events.batchSize` 50 and
   `events.flushIntervalMs` 10_000 (unchanged defaults).
2. R2 — `EVENTS_BATCH_SIZE` env var overrides `events.batchSize`.
3. R3 — `EVENTS_FLUSH_INTERVAL_MS` env var overrides
   `events.flushIntervalMs`.
4. R4 — An invalid (non-integer) value for either env var makes
   `ConfigService.load` throw the standard `readInt` error
   (`Invalid integer for <KEY>: "<value>"`).
5. R5 — `AppConfig` in `config.model.ts` is not changed. No other file is
   changed.
6. R6 — The repository typechecks with `bun run typecheck`.

### Public signature table (frozen)

| Signature | File | Behavior (one line) |
| --------- | ---- | ------------------- |
| `ConfigService.load(env: Env): AppConfig` | `src/config/config.service.ts` | reads `EVENTS_BATCH_SIZE` (int, default 50) into `events.batchSize` and `EVENTS_FLUSH_INTERVAL_MS` (int, default 10_000) into `events.flushIntervalMs`; invalid integer throws |
| Env var `EVENTS_BATCH_SIZE` | n/a | integer; default 50; maps to `config.events.batchSize` |
| Env var `EVENTS_FLUSH_INTERVAL_MS` | n/a | integer; default 10000; maps to `config.events.flushIntervalMs` |

This table is the contract between the parallel implementers. It is
byte-identical in the test plan. No new public symbols are introduced;
`AppConfig`'s shape is unchanged.

## 4. Implementation

### Phase 1: Edit the config loader

#### Task 1: Read the env vars in `ConfigService.load`
- [ ] Open `agent/agents/base/src/config/config.service.ts`.
- [ ] Anchor: inside `static load`, find the `events` block. It currently
      reads exactly:

```ts
      events: {
        batchSize: 50,
        flushIntervalMs: 10_000,
      },
```

- [ ] Replace the two hardcoded values with `readInt` calls, so the block
      becomes behaviorally: `batchSize: readInt(env, "EVENTS_BATCH_SIZE", 50)`
      and `flushIntervalMs: readInt(env, "EVENTS_FLUSH_INTERVAL_MS", 10_000)`.
- [ ] Confirm no import changes are needed: `readInt` is already imported
      from `../utils/env.ts` at the top of the same file.

#### Task 2: Verify nothing else moved
- [ ] Re-read the full file and confirm the only diff is inside the `events`
      block anchored in Task 1.
- [ ] Confirm `config.model.ts` is untouched (R5).

### Phase 2: Verify

#### Task 3: Typecheck and semantic review
- [ ] From `agent/agents/base`, run: `bun run typecheck`
- [ ] Do the semantic review described in section 7.

## 5. Files

| Path | Action | Reason |
| ---- | ------ | ------ |
| `agent/agents/base/src/config/config.service.ts` | edit | read the two new env vars |

## 6. Decisions and risks

- Env var names `EVENTS_BATCH_SIZE` and `EVENTS_FLUSH_INTERVAL_MS` are
  locked. They follow the existing `SCREAMING_SNAKE_CASE` convention of the
  file.
- Invalid input throws via `readInt` (R4); there is no silent fallback and
  no clamping. Locked, consistent with how `PORT` behaves today.
- `AppConfig` stays unchanged on purpose: both fields already exist, so
  consumers see zero interface change.
- Risk: none known. Defaults keep current behavior byte-for-byte.

## 7. Lint and semantic review

- Lint command: `bun run typecheck` (repository: `agent/agents/base`). There
  is no dedicated linter in this project; `tsc --noEmit` is the lint gate.
- Expected result: exit code 0, no errors. Warnings are not failures; this
  command prints nothing on success.
- If lint fails: fix only trivial syntax in your own new code (typo, missing
  semicolon, unused import, formatting — exactly one obvious answer), then
  re-run once. If it still fails, or the cause is anything else (type
  mismatch, missing symbol, contract mismatch), STOP. Do not fix beyond
  trivial syntax. Report status `input-required` with the exact error
  output.
- Semantic review: re-read your full diff. Compare it against R1-R6. Confirm
  style matches the neighboring `readInt(env, "PORT", 6565)` call. Only then
  tick the last task.

## 8. Expected output

Unless your system prompt or the requester explicitly asks for a different
format (for example JSON), when done, reply to the requester in the
requester's language with exactly this shape. If another format is required,
keep the same content (tasks applied, deviations, lint, review) inside that
format.

"I completed the make-events-configurable plan.
Tasks applied:
- [x] Read the env vars in `ConfigService.load`
- [x] Verify nothing else moved
- [x] Typecheck and semantic review
No work outside the plan. / I changed `<thing>` because `<reason>` and
recorded it in Implementation notes.
Lint checked with: `bun run typecheck`. Semantic review complete."

If you had to stop, report instead: status `input-required`, the task you
stopped at, and the exact evidence.

## Implementation notes

(Empty. Fill only if you applied a trivial fix outside the plan.)
