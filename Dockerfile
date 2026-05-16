FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY web/package.json web/
RUN bun install && cd web && bun install
COPY . .
RUN cd web && npx vite build

FROM oven/bun:1
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git python3 build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://opencode.ai/install | bash \
    && ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode || true
WORKDIR /app
COPY --from=build /app/src ./src
COPY --from=build /app/bin ./bin
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/templates ./templates
RUN mkdir -p /app/data /app/results
EXPOSE 7800
ENV AGENT_EVAL_PORT=7800
ENV AGENT_EVAL_DATA_DIR=/app/data
ENV AGENT_EVAL_RESULTS_DIR=/app/results
CMD ["bun", "run", "bin/agent-eval-web.ts"]
