'use strict';

// VANTA relayer entrypoint.
//
//   node src/index.js
//
// Runs fail-closed (dry run) until VANTA_HOT_WALLET_KEYPAIR_PATH is set.
// Every risk control is env-tunable — see src/config.js and README.md.

const { createRelayer } = require('./server');
const { config } = require('./config');

const port = Number(process.env.PORT || 8787);
const server = createRelayer({ config });

server.listen(port, () => {
  console.log(`[vanta-relayer] listening on :${port} (mode: ${server.dryRun ? 'DRY RUN — co-sign disabled' : 'LIVE'})`);
  console.log(`[vanta-relayer] caps: ${JSON.stringify({
    maxSessionSpendLamports: config.MAX_SESSION_SPEND_LAMPORTS,
    maxTxLamports: config.MAX_TX_LAMPORTS,
    globalCapLamports: config.GLOBAL_CAP_LAMPORTS,
    sessionTtlSeconds: config.SESSION_TTL_SECONDS,
  })}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
