# agent-base

A thin wrapper around the [`@earendil-works/pi-coding-agent`](https://pi.dev) SDK that exposes
coding-agent sessions through two interfaces:

- **CLI** — one-shot commands or an interactive REPL
- **HTTP API** — a small JSON API served by Elysia

Built with Bun, Elysia, Commander, and tsyringe (dependency injection).

## Quick start

```bash
bun install
cp .env.example .env         # add the API keys for the providers you use
bun run start                # interactive REPL
bun run start serve          # HTTP API on http://0.0.0.0:6565
```

## Docker

The image compiles the agent into a single executable (`bun build --compile`) and runs `serve`.
It uses the pi SDK in-process; the pi CLI is not installed.

```bash
docker build -t faberic-agent-base .
docker run -d -p 6565:6565 -e OPENROUTER_API_KEY -e PI_DEFAULT_PROVIDER=openrouter \
  -e ORCHESTRATOR_API_URL -e ORCHESTRATOR_API_TOKEN faberic-agent-base
```

- Configuration is the same environment variables as in [Configuration](#configuration).
- Nothing needs a volume: the workspace, pi's config and sessions, and the log file all live under
  the container's `HOME` (`/home/agent`, non-root user `agent`) and are created on start. They are
  gone when the container is removed.
- pi's tools find what they shell out to on `PATH`: `bash`, `git`, `rg` (grep tool), `fd` (find
  tool). The image also has `openssh-client`, `curl`, `wget`, `jq`, `less`, `tree`, `file`,
  `procps`, `diffutils`, `patch`, and archive tools for the agent's bash use.
- `--build-arg EXTRA_PACKAGES="python3 nodejs"` installs more apt packages.
- pi's `package.json` and `photon_rs_bg.wasm` (image resizing) ship next to the executable in
  `/app`, where a compiled pi looks for them.

## CLI

The CLI is the entry point (`src/index.ts`). Run it with `bun run start <command>`, or with no
arguments to open the REPL.

### One-shot commands

```bash
bun run start session create --provider anthropic --model claude-sonnet-4-5
bun run start session prompt "Explain the layout of this repository"
```

Each one-shot invocation is a separate process, and open sessions live in that process, so
`create` in one invocation and `prompt` in the next does not work. For multi-step work, use the REPL
or the HTTP API.

Sessions themselves are stored on disk by pi, so you can pick one up later with
`session list` and `session continue <sessionId>` (in the REPL or over HTTP). pi only writes a
session file once the assistant has replied at least once — a session that never got a reply is
not stored and cannot be resumed.

### REPL

```text
$ bun run start
Type "help" for commands, "exit" to quit.
agent> session create --thinking-level high
agent> session prompt "Add a unit test for the config service"
agent> session follow-up "Now run it"
agent> session stats
agent> exit
```

REPL lines accept the same commands as the one-shot CLI. Wrap arguments in single or double quotes
to keep spaces. Running `serve` inside the REPL keeps the process alive after you exit the prompt.

### Commands

| Command                                         | Description                                             |
|-------------------------------------------------|---------------------------------------------------------|
| `serve [--port <port>] [--host <host>]`         | Start the HTTP API (defaults from `PORT` / `HOST`)      |
| `session create [options]`                      | Open a new session (`--provider`, `--model`, `--thinking-level`) |
| `session list`                                  | List the stored pi sessions of the workspace            |
| `session list-open`                             | List the sessions open in this process                  |
| `session set-default <sessionId>`               | Make an open session the default                        |
| `session continue <sessionId>`                  | Open a stored session next to the open ones             |
| `session get`                                   | Show a session                                          |
| `session abort`                                 | Abort the running operation, keep the session           |
| `session destroy`                               | Abort and close a session                               |
| `session get-model`                             | Show the model                                          |
| `session set-model <provider> <model>`          | Switch the model                                        |
| `session list-models [--provider <provider>]`   | List models usable with the configured credentials      |
| `session get-thinking-level`                    | Show the thinking level and the levels the model supports |
| `session set-thinking-level <level>`            | Set the thinking level                                  |
| `session stats`                                 | Show token usage, cost, and message counts              |
| `session messages`                              | Print the conversation                                  |
| `session prompt <text...>`                      | Send a prompt and print the assistant's reply           |
| `session follow-up <text...>`                   | Send a follow-up and print the assistant's reply        |

Every command from `get` to `follow-up` except `list-models` takes `--session <sessionId>` to act on
a specific open session, e.g. `session prompt "hi" --session <id>`. Without it the command acts on
the default session.

Thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

Environment commands prepare the workspace (see [Workspace](#workspace)):

| Command                                                        | Description                                      |
|----------------------------------------------------------------|--------------------------------------------------|
| `environment clone <url> [--directory <dir>] [--depth <n>]`   | `git clone` one repository into the workspace (folder named after the repository by default) |
| `environment create-agent-md [content...] [--file <path>]`    | Write `AGENTS.md` in the workspace               |
| `environment inject-skill <name> [content...] [--file <path>]` | Write `.pi/skills/<name>/SKILL.md` in the workspace |

Content is either the words after the command or the contents of `--file`, not both.

Monitoring commands show the runtime state of the current process (see [Monitoring](#monitoring)):

| Command                | Description                                              |
|------------------------|----------------------------------------------------------|
| `monitoring sessions`  | Every open session with its stats                        |
| `monitoring events`    | Event counters and delivery state of the event manager   |
| `monitoring errors`    | The tail of the error log                                |

Run `bun run start help` or `bun run start session help` for the full option list.

## HTTP API

Start with `bun run start serve`. Several sessions can be open at once. Endpoints that act on a
session take an optional `?sessionId=<id>` query parameter; without it (or when it is empty) they act
on the default session. Request and response bodies are JSON.

`insomnia.json` is an Insomnia collection with every endpoint (Import → From File). Its `local`
environment has `base_url` and `session_id`; an empty `session_id` targets the default session.

| Method | Path                      | Description                                                            |
|--------|---------------------------|------------------------------------------------------------------------|
| GET    | `/health`                 | Liveness check                                                         |
| POST   | `/session`                | Open a new session (`provider`, `model`, `thinkingLevel`) — returns 201 |
| GET    | `/session`                | Get a session                                                          |
| GET    | `/session/open`           | List the open sessions                                                 |
| PUT    | `/session/default`        | Make an open session the default (`sessionId`)                         |
| GET    | `/session/list`           | List the stored sessions of the workspace                              |
| POST   | `/session/continue`       | Open a stored session next to the open ones (`sessionId`)              |
| POST   | `/session/abort`          | Abort the running operation, keep the session                          |
| DELETE | `/session`                | Abort and close a session; returns its `id`                            |
| GET    | `/session/model`          | Get the model                                                          |
| PUT    | `/session/model`          | Switch the model (`provider`, `model`)                                 |
| GET    | `/session/models`         | List available models (`?provider=...`) — no session required          |
| GET    | `/session/thinking-level` | Get the thinking level and supported levels                            |
| PUT    | `/session/thinking-level` | Set the thinking level (`thinkingLevel`)                               |
| GET    | `/session/stats`          | Get session stats                                                      |
| GET    | `/session/messages`       | Get the conversation                                                   |
| POST   | `/session/prompt`         | Send a prompt (`text`); returns `messages` and `stats`                 |
| POST   | `/session/follow-up`      | Send a follow-up (`text`); returns `messages` and `stats`              |
| POST   | `/environment/clone`      | Clone several repositories (`repositories: [{ url, directory, depth }]`) — 201, or 207 if any failed |
| POST   | `/environment/agent-md`   | Write `AGENTS.md` (`content`) — returns 201 and `path`                 |
| POST   | `/environment/skills`     | Write a skill (`name`, `content`) — returns 201 and `path`             |
| GET    | `/monitoring/sessions`    | Every open session: its descriptor plus `stats`                        |
| GET    | `/monitoring/events`      | Event manager counters (see [Monitoring](#monitoring))                 |
| GET    | `/monitoring/errors`      | `{ file, log }`: the log file and the last 600 characters of its error lines |

Session descriptors (`GET /session`, `/session/open`, create, continue, abort, default) include
`isDefault`.

`POST /environment/clone` answers `{ "repositories": [...] }` with one entry per requested
repository, in request order: `{ url, path, status: "cloned" }` or
`{ url, path, status: "failed", error }`. One failed clone does not stop the others; the status is
201 when all were cloned and 207 otherwise. Invalid input (an empty list, a bad entry, a directory
outside the workspace, two entries cloning into the same folder) rejects the whole request with 400
before anything is cloned.

Example:

```bash
curl -X POST localhost:6565/session -H 'content-type: application/json' \
  -d '{"provider":"anthropic","model":"claude-sonnet-4-5"}'
curl -X POST localhost:6565/session/prompt -H 'content-type: application/json' \
  -d '{"text":"Summarize the README"}'
curl -X POST 'localhost:6565/session/prompt?sessionId=<id>' -H 'content-type: application/json' \
  -d '{"text":"Summarize the README"}'
```

### Errors

Errors are returned as `{ "error": "<ErrorName>", "message": "..." }`:

| Status | When                                                                              |
|--------|-----------------------------------------------------------------------------------|
| 400    | Invalid input (`ValidationError`) or malformed JSON                               |
| 404    | No open session, `sessionId` not open (`SessionNotOpenError`), unknown model, stored session not found, unknown route |
| 503    | The provider has no credentials (`MissingCredentialsError`) — on prompt, follow-up, or model switch |
| 500    | Unexpected errors                                                                 |

The CLI reports the same errors as `error: <message>` on stderr with exit code 1.

## Configuration

Bun loads `.env` automatically, but only from the directory you run the command in — run it
from `agent/agents/base`. Configuration is read through `ConfigService`
(`src/config/config.service.ts`), using the small readers in `src/utils/env.ts`.

| Variable                    | Default                        | Description                                          |
|-----------------------------|--------------------------------|------------------------------------------------------|
| `PORT`                      | `6565`                         | HTTP port                                            |
| `HOST`                      | `0.0.0.0`                      | HTTP bind address                                    |
| `PI_AGENT_DIR`              | `~/.pi/agent`                  | pi agent directory                                   |
| `PI_AUTH_PATH`              | `~/.pi/agent/auth.json`        | pi auth file                                         |
| `PI_MODELS_PATH`            | `~/.pi/agent/models.json`      | pi models file                                       |
| `PI_SESSION_DIR`            | pi default                     | Session storage; the default is shared with the pi CLI (`~/.pi/agent/sessions/<cwd>/`) |
| `PI_DEFAULT_PROVIDER`       | `anthropic`                    | Provider used when none is given                     |
| `PI_DEFAULT_MODEL`          | `claude-sonnet-4-5`            | Model used when none is given                        |
| `PI_DEFAULT_THINKING_LEVEL` | `medium`                       | Thinking level used when none is given               |
| `ORCHESTRATOR_API_URL`      | —                              | Orchestrator API base URL (`<base>/events`, `<base>/git/token`) |
| `ORCHESTRATOR_API_TOKEN`    | —                              | Bearer token for the orchestrator API                |
| `LOG_CONSOLE_LEVEL`         | `info`                         | Lowest level written to the console: `debug`, `info`, `warn`, `error` |
| `LOG_FILE_LEVEL`            | `error`                        | Lowest level written to the log file                 |
| `LOG_FILE`                  | `~/.faberic/logs/agent.log`    | Log file; created with its directory on the first write, appended to across runs |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ... | —               | Credentials for the providers you use; logins made with the pi CLI (in `PI_AUTH_PATH`) also count |

### Workspace

An agent has exactly one working directory, the workspace: `~/.faberic/workspace`. It is fixed —
no environment variable, flag, or request field changes it. It is created on every start (CLI,
REPL, or `serve`) if it does not exist yet; an existing workspace is kept as it is. Every pi session
is created in it, and `session list` / `session continue` only see sessions stored for it, so a
session from another directory cannot be resumed here.

The environment operations fill it:

- **clone** runs `git clone [--depth <n>] -- <url> <dir>` with `git` from `PATH`; without a depth
  the full history is cloned. The service takes a list and clones up to 3 repositories at a time;
  the CLI clones one per command, the HTTP API a whole list. An existing destination is refused.
  For HTTP(S) URLs it first asks the orchestrator for a token (`POST <base>/git/token` with
  `{ "url": "<repository url>" }`, answered with `{ "token": "..." }`; the orchestrator gets it
  through the OAuth device flow). The token is sent to git as
  `Authorization: Basic base64(x-access-token:<token>)`, the form GitHub accepts, through
  `GIT_CONFIG_*` environment variables scoped to the repository's origin — it never shows up in the
  process arguments, in `.git/config`, or in events, and a redirect to another host does not get it.
  A clone fails if the orchestrator is not configured or has no token for the URL. SSH and local
  URLs are cloned without asking. git never prompts for credentials (`GIT_TERMINAL_PROMPT=0`).
- **create-agent-md** writes `AGENTS.md` at the workspace root, where pi loads it as context for
  every session. An existing file is replaced.
- **inject-skill** writes the content as-is to `.pi/skills/<name>/SKILL.md` at the workspace root,
  where pi discovers project skills. The content has to be a
  complete skill with `name` and `description` frontmatter. Names follow the Agent Skills rules
  (lowercase letters, digits, single hyphens, at most 64 characters). An existing skill is replaced.

The clone `directory` must stay inside the workspace; anything else is a `ValidationError`.

### Monitoring

Monitoring is read-only and covers the current process only; nothing is persisted.

- **sessions** — every session open in `SessionManagerService`, in opening order, as the session
  descriptor (`id`, `isDefault`, `status`, `model`, `thinkingLevel`, `createdAt`) plus `stats`.
- **events** — counters kept by `EventManager` since start: `received`, `receivedByType`
  (per event type), `sent`, `pending`, `batchesSent`, `failedBatches`, `lastSentAt`, and
  `lastError` (`{ message, time }` of the last failed batch). Unset times are `null`.
- **errors** — read from the log file, not from memory. Only the last 64 KiB of the file are read,
  so the cost does not grow with the file; the `error` lines found there (`<ISO time> error:
  <message>`, oldest first) are joined and the last 600 characters returned as `log`, next to the
  `file` path. The cut is by characters, so the first line can be partial. Since the file is
  appended to across runs, errors of earlier runs show up too. With `LOG_FILE_LEVEL` above
  `error` nothing is filtered out; with a lower level, other lines take space in the 64 KiB window.

### Logging

`LoggerService` is injected wherever something can fail in the background or outside a CLI
command's own output. Each entry is one `<ISO time> <level>: <message>` line (newlines in the
message are escaped as `\n`). It goes to stderr when its level is at or above `LOG_CONSOLE_LEVEL`
and to `LOG_FILE` when at or above `LOG_FILE_LEVEL`; the two are independent. Nothing is kept in
memory.

`FileLogWriter` appends through a write stream: logging only queues the line and never waits on
the disk. Queued lines are flushed before `/monitoring/errors` reads the file and when the process
exits. If the file cannot be written, a single `warning:` is printed and file logging stops; the
process keeps running. There is no rotation. What is logged:

- HTTP requests that fail: 5xx as `error`, client errors (400/404/409) as `warn`.
- Failed environment operations (clone, AGENTS.md, skill) as `error`, including clones that only
  show up as `failed` in a 207 response.
- Event batches that fail in the background as `error` (they are retried).

CLI command errors are not logged: they are printed as `error: <message>` as before.

### Startup checks

On every start (CLI, REPL, or `serve`) the app checks that `PI_DEFAULT_PROVIDER` is a known
provider, that `PI_DEFAULT_MODEL` exists in its catalog, and that the provider has credentials.
Problems are printed as `warning: ...` on stderr and the app keeps running — listing and resuming
sessions works without credentials; prompting does not.

## Architecture

```
src/
  index.ts                        entry point -> CLI
  cli/                            Commander program, REPL, startup checks
    format.ts                     terminal output formatting
    handlers/                     CLI adapters (session, environment, monitoring) -> controller, format output
  http/                           Elysia server, routers, error -> status mapping
    handlers/                     HTTP adapters (session, environment, monitoring) -> controller, set status codes
  controllers/                    transport-agnostic validation and orchestration
    session.controller.ts
    environment.controller.ts
    monitoring.controller.ts
  dto/                            raw inputs from CLI/HTTP and controller outputs
  services/session/
    session-manager.service.ts    owns the open sessions and the default one
    session.service.ts            pi SDK operations on an open session (default if no id)
  services/environment/
    environment.service.ts        workspace setup: clone, AGENTS.md, skills; reports events
  services/event/
    event-manager.service.ts      observer: queues events and sends them in batches; keeps counters
  services/log/
    logger.service.ts             levels, line format; fans out to console and file
    log-writers.ts                console writer, non-blocking file writer (append, tail read)
  services/monitoring/
    monitoring.service.ts         read-only view of sessions, event counters, and errors
  utils/clients/pi/client.ts      the only module that imports the pi SDK
  utils/clients/git/client.ts     runs the git binary
  utils/clients/orchestrator/     orchestrator API: event batches, git tokens
  utils/errors/                   domain errors (mapped to HTTP status / CLI exit codes)
  utils/validation.ts             input validators used by the controller
  utils/paths.ts                  keeps paths inside the workspace
  utils/concurrency.ts            maps a list with a limit on parallel calls
  utils/fs.ts                     small file system helpers
  utils/env.ts                    environment variable readers
  config/                         configuration
  models/                         validated domain types, independent of SDK types
```

Request flow:

```
CLI command ─┐
             ├─> handler (adapter) -> controller -> session service / manager -> pi client -> SDK
             │                                   -> environment service -> git client / file system
             │                                   -> monitoring service -> session manager, event manager, logger
HTTP request ┘
```

### Design notes

- **Shared controller.** The CLI and HTTP handlers are thin adapters. Validation, orchestration,
  and domain errors live in `SessionController`, `EnvironmentController`, and `MonitoringController`, so both interfaces
  behave identically.
- **Several sessions, one default.** `SessionManagerService` keeps every open session in opening
  order. Every session operation takes an optional session id; without one it uses the default
  session. The default is the oldest open session unless `set-default` picked another one; when
  the picked one is destroyed, the oldest open session is the default again. `create` and
  `continue` add a session, and `continue` of a session that is already open returns it. Targeting
  a session that is not open fails with `SessionNotOpenError` (404).
- **DTOs vs. models.** `dto/` types are unvalidated input as it arrives from the CLI or HTTP
  (fields are `unknown`). The controller validates them into `models/` types, which is all the
  services and the pi client ever see.
- **SDK isolation.** `utils/clients/pi/client.ts` defines a small `SessionSdk` interface and its
  `PiSessionClient` implementation. Nothing else imports the SDK, and tests swap in
  `MockSessionSdk` at the DI boundary. Future external clients follow the same pattern under
  `utils/clients/<name>/`.
- **Message roles** are passed through from the SDK unchanged (`user`, `assistant`,
  `toolResult`, `bashExecution`, `compactionSummary`, ...).
- **Events (observer pattern).** `EventManager` is the observer: it implements `EventObserver`
  (`update(event)`) and queues each `AgentEvent` (`type`, optional `sessionId`, `time`, `description`).
  The pi session is the observable: `SessionManagerService` subscribes the manager to every session
  it opens and unsubscribes when that session is destroyed. The pi client forwards only
  `agent_start` (a prompt run began) and `agent_end` (the run, including all tool turns, finished).
  `EnvironmentService` also reports to the manager: each operation sends `<type>_start`, then
  `<type>_end` or `<type>_error` (with the error message), where `<type>` is `repository_clone`,
  `agent_md_create`, or `skill_inject`. These events have no `sessionId`. Invalid input is rejected
  before the start event, so it sends nothing.
  A batch is sent as soon as 50 events are queued, or 10 seconds after the first queued event,
  whichever comes first.
  Batches are sent one at a time, so order is preserved. A failed batch goes back to the front of
  the queue and is retried on the next interval. `stop()` sends whatever is left.
  The orchestrator receives `POST <ORCHESTRATOR_API_URL>/events` with `Authorization: Bearer <token>` and
  body `{ "events": [...] }`. The manager is created at startup and stopped on
  every exit (end of a one-shot command, `exit` in the REPL, SIGINT/SIGTERM while serving), so
  queued events are sent before the process ends; if they cannot be, a warning is printed.
- **Credentials are checked before the provider is called.** Prompting, following up, or switching
  to a provider without credentials fails fast with `MissingCredentialsError` instead of an opaque
  SDK error.

## Development

```bash
bun run dev               # run the CLI with --watch
bun run typecheck         # tsc --noEmit
bun test                  # all tests
bun run test:unit         # test/unit — real classes with MockSessionSdk
bun run test:integration  # test/integration — HTTP via fetch, CLI end-to-end, real pi SDK and git
bun run test:coverage     # all tests with coverage; fails below 95% lines or functions
```

No test touches the network or your real pi data:

- Most tests use `MockSessionSdk` (`test/mocks/session-sdk.mock.ts`), which implements
  `SessionSdk` and mirrors pi's behavior (sessions are stored only after a reply, providers without
  credentials are refused, thinking levels are clamped).
- `test/integration/pi/client.test.ts` runs `PiSessionClient` against the real pi SDK, offline, in a
  temporary directory, with provider credential variables cleared for the duration of each test.
- Tests use `createTestLogger()` (`test/mocks/logger.mock.ts`), which records console and file
  lines in memory. `test/integration/log/file-log-writer.test.ts` runs `FileLogWriter` against a
  real file in a temporary directory.
- Environment tests use `MockGit` and `MockGitTokenSource` (`test/mocks/environment.mock.ts`) and a
  fresh workspace under the system temp directory, removed after each test.
- `test/integration/git/client.test.ts` runs `GitClient` against the real `git` binary, cloning a
  repository it creates in a temporary directory (full and shallow clones), and checks the auth
  header git sends against a local HTTP server.

Coverage settings live in `bunfig.toml`; the text report is printed and `coverage/lcov.info` is
written. Bun only measures files that tests load, so the startup wiring (`src/index.ts`,
`src/cli/index.ts`, `src/container.ts`) is not included in the numbers.
