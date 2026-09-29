# Vanta devnet faucet — standalone image.
#
# Build context is faucet/ (see .dockerignore), so only the deps the faucet
# actually needs are installed. The root package.json is NOT usable here: it
# references @heliuslabs/zolana as `file:../zolana-sdk-v0.3.0`, which cannot
# resolve inside a container.
#
# Deliberately a separate image from relayer/Dockerfile, on its own service with
# its own wallet. The relayer only ever pays network fees and this only ever pays
# grants, so a drained faucet is structurally incapable of touching the relayer's
# fee float.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Dependencies first so code edits don't bust the install layer.
COPY package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# server.js is self-contained: it loads the local dev env files itself rather
# than importing relayer/env.js, so faucet/ is the whole build context.
COPY server.js ./

# It runs unprivileged and needs no volume. Production must inject
# FAUCET_KEYPAIR; refuse to start with a keypair baked into a layer.
RUN chown -R node:node /app
USER node

EXPOSE 3003

# /healthz answers without touching the RPC, so a Solana hiccup doesn't
# restart-loop the service.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.FAUCET_PORT||3003)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
