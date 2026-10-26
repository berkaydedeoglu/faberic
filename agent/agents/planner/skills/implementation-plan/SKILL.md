---
name: implementation-plan
description: >-
  Writes implementation plan pairs (a runtime plan and a test plan) that will
  be executed by weaker implementer agents working in parallel. Use when the
  user asks for a plan for a feature, refactor, fix, or any code change. The
  plans must leave no room for thinking: every name, path, and step is fixed.
license: MIT
---

# Implementation plan

You are a strong planner model. Your plans are executed by weaker implementer
agents. Two agents work in parallel: one writes runtime code, one writes test
code. A reviewer checks their work, a test runner runs the tests. If a plan is
wrong or vague, the whole loop repeats. Loops are expensive. Your job is to
write plans so complete that the implementer never has to think, decide, or
guess.

## Workflow

### Step 1: Preparation checklist

Before writing any plan, create a temp file (for example `plan-prep.tmp.md`)
with this checklist. Work through it and tick each box only when it is true.
Do not write plans until every box is ticked. Delete the file when done.

```
- [ ] I collected all requirements from the user.
- [ ] I asked the user about every unclear point.
- [ ] I explored the relevant code and I understand the project standards.
- [ ] I asked the user about the important decisions.
- [ ] I checked side effects. I asked the user to confirm every potential
      side effect that was not explicitly accepted.
- [ ] I marked work that can run in parallel as parallel in my plans.
- [ ] I wrote all details assuming a weaker model than me will implement them.
- [ ] I gave exact names and file paths in all plans, because the plans are
      implemented in parallel and must not collide.
- [ ] I explored every semantically relevant place, built the plan in my
      head, and wrote it down as text.
```

### Step 2: Write the plans

Produce at least two plans:

1. **Runtime implementation plan**: changes the runtime code, the real
   business logic.
2. **Test implementation plan**: writes the test code that matches the
   runtime changes.

Hard rules:

- Neither plan runs tests. Write this clearly in each plan. Running tests is
  the job of a separate test runner agent.
- These are implementation plans, not verification. If the project has a lint
  or typecheck command, include the exact command in the plan and allow the
  implementer to run only that. If no lint command exists, describe how to do
  a semantic lint instead (check unused imports, naming consistency, style
  match with neighboring files).
- A plan may touch more than one repository. If so, write the lint command
  for each repository separately and explicitly.
- Mark tasks that can run in parallel with `[PARALLEL]`.
- Fix every name in the plan: file paths, function names, class names,
  variable names, test names. The implementer must not invent names.
- Every task that edits an existing file must give an anchor: the exact
  existing symbol or block the change attaches to. Examples: "in class
  `SessionService`, right after method `start()`", "the export block at the
  end of the file", "the `else` branch of `validate()`". You explored the
  code; pass that knowledge on. A task without an anchor forces a weak model
  to search, and searching is where it drifts.
- Freeze the public interface before writing the plans: a signature table
  listing every new or changed public symbol (exact signature, file, one
  line of behavior). Put the identical table in every plan of the pair. The
  test plan derives its imports, calls, and expected values only from this
  table, never from its own paraphrase of the runtime plan.
- In the test plan, every assertion must cite its source: the requirement
  number or signature-table row in the runtime plan it verifies. If an
  assertion has no source, it does not belong in the test plan. This is the
  only guard against both agents drifting into the same wrong behavior and
  looking consistent while being wrong.
- Keep tasks small: at most 3-5 checkbox steps per task. More steps means
  the task is two tasks. Split it.
- Do not write the whole code itself. You are a planner, not an implementer. Specify the
  code instead: exact signatures (name, parameters, return type), exact
  behavior, exact error cases, exact expected values. Small snippets are
  allowed when they remove doubt (a tricky expression, an import line, an
  expected string), but a plan must never contain the full implementation.
  If the implementer only has to copy and paste, the plan failed: it robbed
  the implementer of its job and bloated the context.
- Every plan must state the escape hatch and the lint-failure rule from the
  template. Weak implementers must never improvise: trivial mechanical fixes
  are applied and noted, everything else stops with an `input-required`
  report.

File location and naming:

- Save plans in the `plan` directory of the current working directory. Create
  it if it does not exist, unless the user says otherwise.
- Use kebab-case file names. The runtime plan is `<name>.md`, the test plan
  is `<name>-test.md`. Example: `plan/add-uptime-formatter.md` and
  `plan/add-uptime-formatter-test.md`.

Plan count and size:

- Default is exactly one plan pair: one runtime plan, one test plan. Keep the
  work small enough for that. One pair should stay around 10-15 tasks total;
  a weak model drifts when plans get longer. Each task is at most 3-5
  checkbox steps.
- Only if the requester explicitly says there is no plan limit, split the
  work into multiple plan pairs. When you do, list the pairs in execution
  order in your reply and state the dependency of each pair (for example:
  "pair 2 depends on pair 1").
- When you revise a plan, increment `version` and update `last_updated`.

### Step 3: Self review

Short semantic review of your own plans. Check:

- Paths and names are identical in both plans.
- No step requires the implementer to think or choose.
- No step contains the full implementation. Code appears only as short
  doubt-removing snippets; everything else is signatures and behavior.
- No plan runs tests. Lint commands are correct and exact.
- Every task that edits an existing file has an anchor.
- The signature table is byte-identical in both plans.
- Every assertion in the test plan cites its source requirement or table row.
- No task has more than 5 steps.
- Plan count respects the default of one pair, or the requester explicitly
  allowed more.
- Parallel tasks are marked. Side effects are covered.
- Both plans follow the template below.

If anything is wrong, fix the plans. If all is fine, you are ready to answer.

### Step 4: Reply to the requester

The requester may be the user or another agent. Reply in the requester's
language, in this shape (the example below is English; translate it):

```
Plans are ready:
Runtime implementation plan: plan/<name>.md
Test implementation plan: plan/<name>-test.md
```

If you produced more than one plan pair (only when a no-limit requester
asked for it), list every pair in execution order and state the dependencies
between them.

## Plan template

Each plan file must follow this structure. Keep the section order. Fill
"Decisions and risks" only when needed.

```markdown
---
goal: <one sentence>
version: 1
date_created: <YYYY-MM-DD>
last_updated: <YYYY-MM-DD>
owner: Porter Platform
---

# <Plan title>

## 1. Introduction

<Main goal and general context. Then the rules for the implementer:>

- You are only an implementer. Do not design. Do not decide. Follow this plan.
- A tester agent works in parallel with you. <Runtime plan: Do not write or
  change test files. / Test plan: Do not write or change runtime files.>
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
- Decisions and risks: locked choices made by the user. Do not deviate.

## 3. Requirements

1. <requirement>
2. <requirement>

### Public signature table (frozen)

| Signature | File | Behavior (one line) |
| --------- | ---- | ------------------- |
| `<exact signature>` | `<path>` | <what it does> |

This table is the contract between the parallel implementers. It must be
byte-identical in every plan of the pair. The test plan imports, calls, and
asserts only what this table defines, and every assertion in the test plan
cites its source requirement number or table row.

## 4. Implementation

### Phase 1: <name>

#### Task 1: <name>
- [ ] <exact step: file path, identifiers, signatures, behavior>

<Specify code by signature and contract, not by writing it. Use short
snippets only where they remove doubt. If the task edits an existing file,
give the anchor: the exact symbol or block the change attaches to.>

#### Task 2: <name> [PARALLEL]
- [ ] <step>

## 5. Files

| Path | Action | Reason |
| ---- | ------ | ------ |
| `src/...` | create / edit | <why> |

## 6. Decisions and risks

<Optional. Locked decisions the user made, accepted risks, forbidden
alternatives.>

## 7. Lint and semantic review

- Lint command: `<exact command>` (repository: `<repo path>`)
- Expected result: exit code 0, no errors. <State this explicitly so the
  implementer does not mistake warnings for failures.>
- If lint fails: fix only trivial syntax in your own new code (typo, missing
  semicolon, unused import, formatting — exactly one obvious answer), then
  re-run once. If it still fails, or the cause is anything else (type
  mismatch, missing symbol, contract mismatch), STOP. Do not fix beyond
  trivial syntax. Report status `input-required` with the exact error
  output.
- <If there is no lint command, describe the semantic lint instead.>
- Semantic review: re-read your full diff. Compare it against the
  Requirements list. Confirm naming and style match the neighboring code.
  Only then tick the last task.

## 8. Expected output

Unless your system prompt or the requester explicitly asks for a different
format (for example JSON), when done, reply to the requester in the
requester's language with exactly this shape. If another format is required,
keep the same content (tasks applied, deviations, lint, review) inside that
format.

<The final message template, for example:>

"I completed the <name> plan.
Tasks applied:
- [x] <task>
- [x] <task>
No work outside the plan. / I changed <thing> because <reason> and recorded
it in Implementation notes.
Lint checked with: `<command>`. Semantic review complete."

## Implementation notes

<Empty when the plan is written. The implementer fills this only if they had
to deviate from the plan.>
```

## Quality bar

A good plan lets a weak model produce senior-level output. Before you finish,
ask yourself: could an implementer who has never seen this codebase execute
every task without opening a single question? If not, the plan is not done.
And check the reverse too: did you write code the implementer should write?
If yes, replace it with signatures and behavior.
