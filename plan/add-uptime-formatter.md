---
goal: Add a formatUptime utility to the base agent that converts seconds into a human-readable string.
version: 2
date_created: 2026-10-06
last_updated: 2026-10-06
owner: Porter Platform
---

# Add uptime formatter (runtime)

## 1. Introduction

The base agent needs a small utility that formats an uptime given in seconds
as a compact human-readable string, for example `2d 3h 4m 5s`. This plan
creates the runtime code only.

Rules for you, the implementer:

- You are only an implementer. Do not design. Do not decide. Follow this plan.
- A tester agent works in parallel with you. Do not write or change any test
  files. The tester creates `test/unit/utils/uptime.test.ts` on their own.
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

1. A new file `src/utils/uptime.ts` exists in the `agent/agents/base` repository.
2. It exports a function `formatUptime(totalSeconds: number): string`.
3. `formatUptime` returns a string in the shape `<d>d <h>h <m>m <s>s`, skipping
   leading zero units. Rules:
   - Input is truncated to whole seconds.
   - `0` returns `"0s"`.
   - Units with value 0 are omitted, unless all units are 0.
   - Examples: `59` → `"59s"`, `60` → `"1m"`, `3661` → `"1h 1m 1s"`,
     `90061` → `"1d 1h 1m 1s"`.
4. Negative input throws `ValidationError` from `src/utils/errors/app.errors.ts`
   with the message `"totalSeconds must be >= 0"`.
5. No existing file is modified.
6. The repository typechecks with `bun run typecheck`.

## 4. Implementation

### Phase 1: Create the utility

#### Task 1: Create `src/utils/uptime.ts`
- [ ] Create the file `agent/agents/base/src/utils/uptime.ts`.
- [ ] It must import `ValidationError` exactly like the sibling file
      `src/utils/paths.ts` does:

```ts
import { ValidationError } from "./errors/app.errors.ts";
```

- [ ] It must export one function with exactly this signature:

```ts
export function formatUptime(totalSeconds: number): string
```

- [ ] Behavior contract (all locked, do not change):
  1. Truncate the input to whole seconds (`1.9` behaves as `1`).
  2. If the truncated value is negative, throw
     `ValidationError("totalSeconds must be >= 0")`.
  3. If the truncated value is `0`, return `"0s"`.
  4. Otherwise split the value into days, hours, minutes, seconds
     (86400 / 3600 / 60) and join the nonzero units with single spaces in
     the shape `"1d 2h 3m 4s"`. Units with value 0 are omitted:
     `60` → `"1m"`, `3600` → `"1h"`, `3661` → `"1h 1m 1s"`.
- [ ] Style: one short doc comment above the function, like
      `src/utils/paths.ts`. No other exports, no helper functions.

### Phase 2: Verify

#### Task 2: Typecheck and semantic review
- [ ] From `agent/agents/base`, run: `bun run typecheck`
- [ ] Do the semantic review described in section 7.

## 5. Files

| Path | Action | Reason |
| ---- | ------ | ------ |
| `agent/agents/base/src/utils/uptime.ts` | create | the new utility |

## 6. Decisions and risks

- The output format `<d>d <h>h <m>m <s>s` with omitted zero units is locked:
  `60` → `"1m"`, not `"1m 0s"`. Do not pad with zeros, do not add words like
  "days".
- Negative input throws `ValidationError`; it is not clamped to 0. Locked.
- No barrel/index export exists for `src/utils`; consumers import the file
  directly. Do not create an index file.
- Risk: none. The file is new and imported by nobody yet.

## 7. Lint and semantic review

- Lint command: `bun run typecheck` (repository: `agent/agents/base`). There
  is no dedicated linter in this project; `tsc --noEmit` is the lint gate.
- Semantic review: re-read your full diff. Compare it against the
  Requirements list. Confirm the file matches the style of
  `src/utils/paths.ts` (doc comment, named export, `.ts` import extension).
  Only then tick the last task.

## 8. Expected output

When done, reply to the user in the user's language with exactly this shape:

"I completed the add-uptime-formatter plan.
Tasks applied:
- [x] Create `src/utils/uptime.ts`
- [x] Typecheck and semantic review
No work outside the plan. / I changed `<thing>` because `<reason>` and
recorded it in Implementation notes.
Lint checked with: `bun run typecheck`. Semantic review complete."

## Implementation notes

(Empty. Fill only if you had to deviate from the plan.)
