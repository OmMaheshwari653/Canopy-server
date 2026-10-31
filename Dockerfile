# syntax=docker/dockerfile:1

# ---------- Stage 1: build dependencies ----------
# This is a separate stage because bcrypt is a NATIVE module and needs
# python3/make/g++ to compile. Those compilers stay in this stage only and
# never reach the final image -> smaller and more secure result.
FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first. If the source changes but package.json does not,
# Docker reuses this layer from cache -> much faster rebuilds.
COPY package.json package-lock.json ./

# 'npm ci' (not 'npm install'): installs exact versions from the lockfile,
# which makes the build reproducible.
# --omit=dev: nodemon/faker and friends have no place in a production image.
RUN npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=PRODUCTION \
    PORT=3000

WORKDIR /app

# The node:* images already ship a non-root user called 'node'.
# Running a container as root is the single most common security mistake.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

# EXPOSE is documentation only - it does not actually publish the port.
EXPOSE 3000

# Exec `node` directly instead of `npm start`: npm adds an extra process that
# does not forward SIGTERM to its child properly, which breaks graceful
# shutdown on Kubernetes and gets the pod SIGKILLed 30s later.
CMD ["node", "app.js"]
