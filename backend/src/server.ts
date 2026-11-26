import { app } from './app.ts';
import { config } from './config.ts';
import { migrate } from './db/migrate.ts';
import { pool } from './db/pool.ts';
import { failInterruptedScans } from './scans/repository.ts';
import { startWorker } from './scans/worker.ts';

await migrate(pool);
const interrupted = await failInterruptedScans(pool);
if (interrupted) console.log(`${interrupted} interrupted scan(s) marked as failed`);

const stopWorker = startWorker(pool, config.scanConcurrency);
const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

// Ctrl+C: stop taking new scans, let running ones finish, then close cleanly.
process.once('SIGINT', async () => {
  console.log('shutting down…');
  server.close();
  await stopWorker();
  await pool.end();
});
