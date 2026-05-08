import { serve } from '@hono/node-server';
import { api } from './api/routes.js';
import { initDb } from './db/init.js';
import { runFeedIngestion } from './feeds/runner.js';
import { generateThreatAlerts } from './scoring/analyzer.js';
import { Hono } from 'hono';

const app = new Hono();

app.route('/', api);

app.get('/', (c) => {
  return c.json({
    name: 'Iris — Threat Intelligence Platform',
    version: '1.0.0',
    description: 'Threat intelligence aggregation, IOC correlation, and detection',
    docs: {
      health: 'GET /health',
      iocs: 'GET /iocs?type=&severity=&source=&q=&limit=&offset=',
      iocDetail: 'GET /iocs/:id',
      stats: 'GET /stats',
      feeds: 'GET /feeds',
      ingest: 'POST /feeds/ingest',
      alerts: 'GET /alerts?acknowledged=',
      acknowledge: 'POST /alerts/:id/acknowledge',
    },
  });
});

const PORT = Number(process.env.PORT) || 3000;

initDb();

if (process.argv[1]?.includes('index')) {
  const shouldIngest = process.argv.includes('--ingest');
  if (shouldIngest) {
    runFeedIngestion().then(() => {
      generateThreatAlerts();
    });
  }

  console.log(`[iris] Starting server on port ${PORT}`);
  serve({ fetch: app.fetch, port: PORT });
}

export default app;
