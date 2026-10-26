---
goal: Add unit tests for the formatUptime utility of the base agent.
version: 2
date_created: 2026-10-06
last_updated: 2026-10-06
owner: Porter Platform
---

# Add uptime formatter (tests)

## 1. Introduction

The base agent gains a utility `formatUptime` in
`agent/agents/base/src/utils/uptime.ts` that formats an uptime in seconds as
a string like `1d 2h 3m 4s`. This plan creates the unit tests for it.

Rules for you, the implementer:

- You are only an implementer. Do not design. Do not decide. Follow this plan.
- A runtime implementer agent works in parallel with you and creates
  `src/utils/uptime.ts`. Do not write or change any runtime files. If the
  runtime file does not exist yet when you finish, that is fine; do not
  create it.
- Never run tests. A separate test runner agent does that.
- When you finish a task, tick its checkbox in this file: change `- [ ]` to
  `- [x]`. You may edit this plan file only to tick boxes and to add
  Implementation notes.
- If you must do something that is not in this plan, do it, then record it in
  the Implementation notes section. A good plan should never need this.

## 2. How to read this plan

- Requirements: what must be true when you finish. Check yourself against it.
- Implementation: numbered tasks in phases. Do them in order. Tasks marked
  [PARALLEL] can be done in any order relative to each other.
- Files: the exact files this plan touches. You may read other files, but do
  not write to files that are not listed here unless you record it in
  Implementation notes.
- Decisions and risks: locked choices. Do not deviate.

## 3. Requirements

1. A new file `test/unit/utils/uptime.test.ts` exists in the
   `agent/agents/base` repository.
2. It tests the function `formatUptime` from
   `agent/agents/base/src/utils/uptime.ts` using `bun:test`.
3. Covered cases:
   - `0` → `"0s"`
   - fractional seconds are truncated: `1.9` → `"1s"`
   - `59` → `"59s"`
   - `60` → `"1m 0s"`-style zero handling: exactly `"1m"` is wrong, the
     expected value is `"1m"` only if rest is omitted — see the locked
     contract in section 6: `60` → `"1m"`.
   - `3600` → `"1h"`
   - `3661` → `"1h 1m 1s"`
   - `86400` → `"1d"`
   - `90061` → `"1d 1h 1m 1s"`
   - `-1` throws `ValidationError` with message `"totalSeconds must be >= 0"`
4. No existing file is modified.
5. The repository typechecks with `bun run typecheck`.
6. Tests are written, but never executed by you.

## 4. Implementation

### Phase 1: Create the test file

#### Task 1: Create `test/unit/utils/uptime.test.ts`
- [ ] Read the sibling test `test/unit/utils/paths.test.ts` and match its
      structure: `describe`/`it` from `bun:test`, relative imports with the
      `.ts` extension.
- [ ] Create the file `agent/agents/base/test/unit/utils/uptime.test.ts`.
- [ ] It must import exactly these two symbols:
      - `ValidationError` from `../../../src/utils/errors/app.errors.ts`
      - `formatUptime` from `../../../src/utils/uptime.ts`
- [ ] It must contain one `describe("formatUptime", ...)` block with exactly
      these test cases. Test titles are locked:

| `it` title | Input | Expected |
| ---------- | ----- | -------- |
| `"formats zero seconds"` | `0` | `"0s"` |
| `"truncates fractional seconds"` | `1.9` | `"1s"` |
| `"formats seconds only"` | `59` | `"59s"` |
| `"omits zero units"` | `60`, `3600`, `86400` | `"1m"`, `"1h"`, `"1d"` |
| `"formats compound values"` | `3661`, `90061` | `"1h 1m 1s"`, `"1d 1h 1m 1s"` |
| `"rejects negative input"` | `-1` | throws `ValidationError` with message `"totalSeconds must be >= 0"` |

### Phase 2: Verify

#### Task 2: Typecheck and semantic review
- [ ] From `agent/agents/base`, run: `bun run typecheck`
- [ ] Do the semantic review described in section 7.

## 5. Files

| Path | Action | Reason |
| ---- | ------ | ------ |
| `agent/agents/base/test/unit/utils/uptime.test.ts` | create | tests for the new utility |

## 6. Decisions and risks

- Locked contract of `formatUptime` (defined by the runtime plan, do not
  change it): whole-second truncation; `0` → `"0s"`; zero units are omitted
  (`60` → `"1m"`); compound values join with single spaces; negative input
  throws `ValidationError("totalSeconds must be >= 0")`.
- Risk: the runtime file may not exist yet when you finish, because the
  runtime agent works in parallel. This is expected. Do not create the
  runtime file yourself and do not run the tests.

## 7. Lint and semantic review

- Lint command: `bun run typecheck` (repository: `agent/agents/base`). There
  is no dedicated linter in this project; `tsc --noEmit` is the lint gate.
  Note: typecheck will fail on the missing import if the runtime agent has
  not finished yet. In that case, skip the typecheck, record it in
  Implementation notes, and rely on the semantic review.
- Semantic review: re-read your full diff. Compare every expected string
  against the locked contract in section 6. Confirm the style matches
  `test/unit/utils/paths.test.ts`. Only then tick the last task.

## 8. Expected output

When done, reply to the user in the user's language with exactly this shape:

"I completed the add-uptime-formatter-test plan.
Tasks applied:
- [x] Create `test/unit/utils/uptime.test.ts`
- [x] Typecheck and semantic review
No work outside the plan. / I changed `<thing>` because `<reason>` and
recorded it in Implementation notes.
Lint checked with: `bun run typecheck`. Semantic review complete."

## Implementation notes

(Empty. Fill only if you had to deviate from the plan.)
