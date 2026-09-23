# agent-base

A thin wrapper around the [`@earendil-works/pi-coding-agent`](https://pi.dev) SDK that exposes a
single coding-agent session through two interfaces:

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

## CLI

The CLI is the entry point (`src/index.ts`). Run it with `bun run start <command>`, or with no
arguments to open the REPL.

### One-shot commands

```bash
bun run start session create --provider anthropic --model claude-sonnet-4-5
bun run start session prompt "Explain the layout of this repository"
```

Each one-shot invocation is a separate process, and the *active* session lives in that process, so
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
| `session create [options]`                      | Create the session (`--provider`, `--model`, `--thinking-level`, `--cwd`, `--force`) |
| `session list [--cwd <dir>] [--all]`            | List stored pi sessions (current directory by default)  |
| `session continue <sessionId> [--cwd] [--force]`| Resume a stored session                                 |
| `session get`                                   | Show the active session                                 |
| `session abort`                                 | Abort the running operation, keep the session           |
| `session destroy`                               | Abort and dispose of the session                        |
| `session get-model`                             | Show the active model                                   |
| `session set-model <provider> <model>`          | Switch the model                                        |
| `session list-models [--provider <provider>]`   | List models usable with the configured credentials      |
| `session get-thinking-level`                    | Show the thinking level and the levels the model supports |
| `session set-thinking-level <level>`            | Set the thinking level                                  |
| `session stats`                                 | Show token usage, cost, and message counts              |
| `session messages`                              | Print the conversation                                  |
| `session prompt <text...>`                      | Send a prompt and print the assistant's reply           |
| `session follow-up <text...>`                   | Send a follow-up and print the assistant's reply        |

Thinking levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

Run `bun run start help` or `bun run start session help` for the full option list.

## HTTP API

Start with `bun run start serve`. All session endpoints operate on the single active session
(`/session`, not plural). Request and response bodies are JSON.

| Method | Path                      | Description                                                            |
|--------|---------------------------|------------------------------------------------------------------------|
| GET    | `/health`                 | Liveness check                                                         |
| POST   | `/session`                | Create a session (`provider`, `model`, `thinkingLevel`, `cwd`, `force`) — returns 201 |
| GET    | `/session`                | Get the active session                                                 |
| GET    | `/session/list`           | List stored sessions (`?cwd=...`, `?all=true`)                         |
| POST   | `/session/continue`       | Resume a stored session (`sessionId`, `cwd`, `force`)                  |
| POST   | `/session/abort`          | Abort the running operation, keep the session                          |
| DELETE | `/session`                | Abort and dispose of the session                                       |
| GET    | `/session/model`          | Get the active model                                                   |
| PUT    | `/session/model`          | Switch the model (`provider`, `model`)                                 |
| GET    | `/session/models`         | List available models (`?provider=...`) — no session required          |
| GET    | `/session/thinking-level` | Get the thinking level and supported levels                            |
| PUT    | `/session/thinking-level` | Set the thinking level (`thinkingLevel`)                               |
| GET    | `/session/stats`          | Get session stats                                                      |
| GET    | `/session/messages`       | Get the conversation                                                   |
| POST   | `/session/prompt`         | Send a prompt (`text`); returns `messages` and `stats`                 |
| POST   | `/session/follow-up`      | Send a follow-up (`text`); returns `messages` and `stats`              |

Example:

```bash
curl -X POST localhost:6565/session -H 'content-type: application/json' \
  -d '{"provider":"anthropic","model":"claude-sonnet-4-5"}'
curl -X POST localhost:6565/session/prompt -H 'content-type: application/json' \
  -d '{"text":"Summarize the README"}'
```

### Errors

Errors are returned as `{ "error": "<ErrorName>", "message": "..." }`:

| Status | When                                                                              |
|--------|-----------------------------------------------------------------------------------|
| 400    | Invalid input (`ValidationError`) or malformed JSON                               |
| 404    | No active session, unknown model, stored session not found, unknown route         |
| 409    | A session is already active and `force` was not set (`SessionAlreadyActiveError`) |
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
| `ORCHESTRATOR_API_URL`      | —                              | Endpoint that receives agent events (POST)           |
| `ORCHESTRATOR_API_TOKEN`    | —                              | Bearer token for the orchestrator API                |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ... | —               | Credentials for the providers you use; logins made with the pi CLI (in `PI_AUTH_PATH`) also count |

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
    handlers/session.handler.ts   CLI adapter -> controller, formats output
  http/                           Elysia server, routers, error -> status mapping
    handlers/session.handler.ts   HTTP adapter -> controller, sets status codes
  controllers/session.controller.ts
                                  transport-agnostic validation and orchestration
  dto/                            raw inputs from CLI/HTTP and controller outputs
  services/session/
    session-manager.service.ts    owns the single, process-wide active session
    session.service.ts            pi SDK operations on the active session
  services/event/
    event-manager.service.ts      observer: queues events and sends them in batches
  utils/clients/pi/client.ts      the only module that imports the pi SDK
  utils/clients/orchestrator/     POSTs event batches to the orchestrator API
  utils/errors/                   domain errors (mapped to HTTP status / CLI exit codes)
  utils/validation.ts             input validators used by the controller
  utils/env.ts                    environment variable readers
  config/                         configuration
  models/                         validated domain types, independent of SDK types
```

Request flow:

```
CLI command ─┐
             ├─> handler (adapter) -> controller -> session service / manager -> pi client -> SDK
HTTP request ┘
```

### Design notes

- **Shared controller.** The CLI and HTTP handlers are thin adapters. Validation, orchestration,
  and domain errors live in `SessionController`, so both interfaces behave identically.
- **Single session.** `SessionManagerService` holds at most one active session. Creating or
  resuming a second one fails with `SessionAlreadyActiveError` unless `force` is set. With `force`,
  the new session is opened first and the old one is disposed only if that succeeds.
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
  (`update(event)`) and queues each `AgentEvent` (`type`, `time`, `description`). Services will act
  as the observables and call `update`; none do yet. A batch is sent as
  soon as 50 events are queued, or 10 seconds after the first queued event, whichever comes first.
  Batches are sent one at a time, so order is preserved. A failed batch goes back to the front of
  the queue and is retried on the next interval. `stop()` sends whatever is left.
  The orchestrator receives `POST <ORCHESTRATOR_API_URL>` with `Authorization: Bearer <token>` and
  body `{ "events": [...] }`. The manager is created at startup and stopped on
  every exit (end of a one-shot command, `exit` in the REPL, SIGINT/SIGTERM while serving), so
  queued events are sent before the process ends; if they cannot be, a warning is printed. No
  service calls `update` yet, so nothing is sent today.
- **Credentials are checked before the provider is called.** Prompting, following up, or switching
  to a provider without credentials fails fast with `MissingCredentialsError` instead of an opaque
  SDK error.

## Development

```bash
bun run dev               # run the CLI with --watch
bun run typecheck         # tsc --noEmit
bun test                  # all tests
bun run test:unit         # test/unit — real classes with MockSessionSdk
bun run test:integration  # test/integration — HTTP via fetch, CLI end-to-end, real pi SDK
bun run test:coverage     # all tests with coverage; fails below 95% lines or functions
```

No test touches the network or your real pi data:

- Most tests use `MockSessionSdk` (`test/mocks/session-sdk.mock.ts`), which implements
  `SessionSdk` and mirrors pi's behavior (sessions are stored only after a reply, providers without
  credentials are refused, thinking levels are clamped).
- `test/integration/pi/client.test.ts` runs `PiSessionClient` against the real pi SDK, offline, in a
  temporary directory, with provider credential variables cleared for the duration of each test.

Coverage settings live in `bunfig.toml`; the text report is printed and `coverage/lcov.info` is
written. Bun only measures files that tests load, so the startup wiring (`src/index.ts`,
`src/cli/index.ts`, `src/container.ts`) is not included in the numbers.
