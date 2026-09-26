# syntax=docker/dockerfile:1

# ---- build: compile the agent into a single executable -------------------------------------
FROM oven/bun:1.3-debian AS build
WORKDIR /src

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
RUN bun build --compile --minify-syntax --minify-whitespace --sourcemap src/index.ts --outfile /out/agent

# A compiled pi looks for its package.json and the photon wasm (image resizing) next to the
# executable, so both ship beside it.
RUN cp node_modules/@earendil-works/pi-coding-agent/package.json /out/package.json \
 && cp node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm /out/photon_rs_bg.wasm

# ---- runtime ---------------------------------------------------------------------------------
FROM debian:bookworm-slim

# What pi's tools shell out to:
#   bash (bash tool), git, ripgrep (grep tool), fd-find (find tool), ca-certificates (HTTPS).
# Plus the everyday command line tools an agent reaches for in bash, and tini as PID 1.
# EXTRA_PACKAGES adds more apt packages at build time, e.g. "python3 nodejs build-essential".
ARG EXTRA_PACKAGES=""
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates git openssh-client ripgrep fd-find \
      curl wget jq less tree file procps diffutils patch \
      zip unzip xz-utils bzip2 tini tzdata \
      ${EXTRA_PACKAGES} \
 && ln -s /usr/bin/fdfind /usr/local/bin/fd \
 && rm -rf /var/lib/apt/lists/*

# Repositories are cloned by the agent itself; mark them all safe regardless of owner.
RUN git config --system init.defaultBranch main \
 && git config --system safe.directory '*'

RUN useradd --create-home --shell /bin/bash agent
COPY --from=build /out/ /app/

USER agent
WORKDIR /home/agent

# The workspace (~/.faberic/workspace), pi's config and sessions (~/.pi/agent), and the logs
# (~/.faberic/logs) all live under HOME and are created on start, so no volume is needed.
ENV HOME=/home/agent \
    PORT=6565 \
    HOST=0.0.0.0 \
    PI_SKIP_VERSION_CHECK=1 \
    GIT_TERMINAL_PROMPT=0

EXPOSE 6565
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/app/agent"]
CMD ["serve"]
