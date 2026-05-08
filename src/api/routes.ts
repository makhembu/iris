import { Hono } from 'hono';
import { getDb } from '../db/init.js';
import { runFeedIngestion } from '../feeds/runner.js';
import { IOC, IOCType, FeedSource, SearchQuery, SearchResult } from '../types.js';

export const api = new Hono();

api.get('/health', (c) => {
  const db = getDb();
  try {
    db.prepare('SELECT 1').get();
    const count = (db.prepare('SELECT COUNT(*) as c FROM iocs').get() as { c: number }).c;
    db.close();
    return c.json({ status: 'ok', iocs: count, uptime: process.uptime() });
  } catch (err) {
    db.close();
    return c.json({ status: 'error', error: String(err) }, 500);
  }
});

api.get('/iocs', (c) => {
  const db = getDb();
  const type = c.req.query('type') as IOCType | undefined;
  const severity = c.req.query('severity');
  const source = c.req.query('source') as FeedSource | undefined;
  const minConfidence = Number(c.req.query('minConfidence')) || 0;
  const q = c.req.query('q');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 500);
  const offset = Number(c.req.query('offset')) || 0;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (type) { where += ' AND type = ?'; params.push(type); }
  if (severity) { where += ' AND severity = ?'; params.push(severity); }
  if (source) { where += ' AND source = ?'; params.push(source); }
  if (minConfidence > 0) { where += ' AND confidence >= ?'; params.push(minConfidence); }
  if (q) { where += ' AND (value LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const total = (db.prepare(`SELECT COUNT(*) as c FROM iocs ${where}`).get(...params) as { c: number }).c;
  const iocs = db.prepare(`SELECT * FROM iocs ${where} ORDER BY confidence DESC, last_seen DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as IOC[];

  db.close();
  return c.json({ iocs, total, query: { type, severity, source, q, limit, offset } });
});

api.get('/iocs/:id', (c) => {
  const db = getDb();
  const ioc = db.prepare('SELECT * FROM iocs WHERE id = ?').get(c.req.param('id'));
  db.close();
  if (!ioc) return c.json({ error: 'IOC not found' }, 404);
  return c.json(ioc);
});

api.get('/stats', (c) => {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM iocs').get() as { c: number }).c;
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM iocs GROUP BY type ORDER BY count DESC').all();
  const bySeverity = db.prepare('SELECT severity, COUNT(*) as count FROM iocs GROUP BY severity ORDER BY count DESC').all();
  const bySource = db.prepare('SELECT source, COUNT(*) as count FROM iocs GROUP BY source ORDER BY count DESC').all();
  const topConfidence = db.prepare('SELECT value, type, confidence, severity, last_seen FROM iocs ORDER BY confidence DESC LIMIT 10').all();
  const feedStatus = db.prepare('SELECT * FROM feeds').all();
  const recentAlerts = db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20').all();
  db.close();

  return c.json({ total, byType, bySeverity, bySource, topConfidence, feedStatus, recentAlerts });
});

api.get('/feeds', (c) => {
  const db = getDb();
  const feeds = db.prepare('SELECT * FROM feeds ORDER BY source').all();
  db.close();
  return c.json(feeds);
});

api.post('/feeds/ingest', async (c) => {
  const statuses = await runFeedIngestion();
  return c.json({ message: 'Feed ingestion complete', feeds: statuses });
});

api.get('/alerts', (c) => {
  const db = getDb();
  const acknowledged = c.req.query('acknowledged');
  let alerts;
  if (acknowledged === 'true') {
    alerts = db.prepare('SELECT * FROM alerts WHERE acknowledged = 1 ORDER BY created_at DESC LIMIT 50').all();
  } else if (acknowledged === 'false') {
    alerts = db.prepare('SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT 50').all();
  } else {
    alerts = db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50').all();
  }
  db.close();
  return c.json(alerts);
});

api.post('/alerts/:id/acknowledge', (c) => {
  const db = getDb();
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(Number(c.req.param('id')));
  db.close();
  return c.json({ status: 'acknowledged' });
});
