# Vanta relayer — standalone image.
#
# Build context is relayer/ (see fly.toml / .dockerignore), so only the three
# deps the relayer actually needs are installed. The root package.json is NOT
# usable here: it references @heliuslabs/zolana as `file:../zolana-sdk-v0.3.0`,
# which cannot resolve inside a container.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Dependencies first so code edits don't bust the install layer.
COPY package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# env.js MUST ship: server.js's first import is './env.js' (ESM relies on
# source order), and db.js imports './db.js' + reads schema.sql at boot.
# This line originally copied only server.js, so the image would crash on
# startup with ERR_MODULE_NOT_FOUND before binding a port.
COPY server.js env.js db.js schema.sql ./

# The relayer runs unprivileged. It only ever writes when RELAYER_KEYPAIR is
# absent, which production refuses outright — so /app stays read-write-safe
# without needing a volume.
RUN chown -R node:node /app
USER node

EXPOSE 3001

# /healthz answers without touching the RPC, so a Solana hiccup doesn't
# restart-loop the machine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.RELAYER_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
