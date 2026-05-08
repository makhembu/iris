import { getDb } from '../db/init.js';
import { IOC, IOCType } from '../types.js';

export interface CorrelationResult {
  primaryIoc: IOC;
  relatedIocs: IOC[];
  commonality: number;
}

export function findRelatedIocs(iocId: string): CorrelationResult | null {
  const db = getDb();
  const primary = db.prepare('SELECT * FROM iocs WHERE id = ?').get(iocId) as IOC | undefined;
  if (!primary) { db.close(); return null; }

  const related: IOC[] = [];
  if (primary.type === 'domain') {
    const ips = db.prepare(
      'SELECT * FROM iocs WHERE type = ? AND (value LIKE ? OR description LIKE ?) ORDER BY confidence DESC LIMIT 20'
    ).all('ip', `%${primary.value}%`, `%${primary.value}%`) as IOC[];
    related.push(...ips);
  }

  if (primary.type === 'ip') {
    const domains = db.prepare(
      'SELECT * FROM iocs WHERE type = ? AND (value LIKE ? OR description LIKE ?) ORDER BY confidence DESC LIMIT 20'
    ).all('domain', `%${primary.value}%`, `%${primary.value}%`) as IOC[];
    related.push(...domains);
  }

  const sameSource = db.prepare(
    'SELECT * FROM iocs WHERE source = ? AND id != ? ORDER BY confidence DESC LIMIT 10'
  ).all(primary.source, primary.id) as IOC[];
  related.push(...sameSource);

  const unique = new Map<string, IOC>();
  for (const r of related) unique.set(r.id, r);

  db.close();
  return { primaryIoc: primary, relatedIocs: [...unique.values()], commonality: unique.size };
}

export function generateThreatAlerts(): void {
  const db = getDb();
  const criticalIocs = db.prepare(
    'SELECT * FROM iocs WHERE severity = ? AND confidence >= ? ORDER BY last_seen DESC'
  ).all('critical', 0.7) as IOC[];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO alerts (ioc_id, rule, severity, message)
    VALUES (?, ?, ?, ?)
  `);

  for (const ioc of criticalIocs) {
    const message = `High-confidence ${ioc.type} IOC detected: ${ioc.value} (source: ${ioc.source}, confidence: ${ioc.confidence})`;
    insert.run(ioc.id, 'high_confidence_ioc', ioc.severity, message);
  }

  const crossSourceIocs = db.prepare(
    'SELECT * FROM iocs WHERE cross_source_hits >= 3 ORDER BY confidence DESC LIMIT 100'
  ).all() as IOC[];

  for (const ioc of crossSourceIocs) {
    const message = `Cross-source confirmed IOC: ${ioc.value} seen across ${ioc.crossSourceHits} sources`;
    insert.run(ioc.id, 'cross_source_confirmation', ioc.severity, message);
  }

  console.log(`[iris] Generated alerts: ${criticalIocs.length} critical + ${crossSourceIocs.length} cross-source`);
  db.close();
}

export function getThreatTimeline(days: number = 7): { date: string; count: number }[] {
  const db = getDb();
  const results = db.prepare(`
    SELECT DATE(last_seen) as date, COUNT(*) as count
    FROM iocs
    WHERE last_seen >= DATE('now', ? || ' days')
    GROUP BY DATE(last_seen)
    ORDER BY date
  `).all(`-${days}`) as { date: string; count: number }[];
  db.close();
  return results;
}
