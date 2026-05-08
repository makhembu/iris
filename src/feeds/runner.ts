import { getDb } from '../db/init.js';
import { FeedSource, IOC, IOCType, ThreatCategory, FeedStatus } from '../types.js';

interface FeedHandler {
  source: FeedSource;
  fetch: () => Promise<{ value: string; type: IOCType; category?: ThreatCategory }[]>;
}

async function fetchAlienVault(): Promise<{ value: string; type: IOCType; category?: ThreatCategory }[]> {
  const results: { value: string; type: IOCType; category?: ThreatCategory }[] = [];
  try {
    const apiKey = process.env.ALIENVAULT_OTX_KEY;
    if (!apiKey) return results;
    const res = await fetch('https://otx.alienvault.com/api/v1/indicators/export', {
      headers: { 'X-OTX-API-Key': apiKey },
    });
    if (!res.ok) return results;
    const data = await res.json() as { results: { indicator: string; type: string }[] };
    for (const item of data.results || []) {
      const type = mapOtxType(item.type);
      if (type) results.push({ value: item.indicator, type, category: 'unknown' });
    }
  } catch { /* feed unavailable */ }
  return results;
}

async function fetchURLhaus(): Promise<{ value: string; type: IOCType; category?: ThreatCategory }[]> {
  const results: { value: string; type: IOCType; category?: ThreatCategory }[] = [];
  try {
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'limit=100',
    });
    if (!res.ok) return results;
    const data = await res.json() as { urls: { url: string; threat: string; id: string }[] };
    for (const item of data.urls || []) {
      results.push({ value: item.url, type: 'url', category: mapThreat(item.threat) });
    }
  } catch { /* feed unavailable */ }
  return results;
}

async function fetchPhishTank(): Promise<{ value: string; type: IOCType; category?: ThreatCategory }[]> {
  const results: { value: string; type: IOCType; category?: ThreatCategory }[] = [];
  try {
    const res = await fetch('https://data.phishtank.com/data/online-valid.json', {
      headers: { 'User-Agent': 'iris-threat-intel/1.0' },
    });
    if (!res.ok) return results;
    const data = await res.json() as { url: string; phish_detail_url: string }[];
    for (const item of (data || []).slice(0, 200)) {
      results.push({ value: item.url, type: 'url', category: 'phishing' });
    }
  } catch { /* feed unavailable */ }
  return results;
}

function mapOtxType(t: string): IOCType | null {
  const map: Record<string, IOCType> = {
    'IPv4': 'ip', 'IPv6': 'ip',
    'domain': 'domain', 'hostname': 'domain',
    'URL': 'url',
    'MD5': 'hash', 'SHA1': 'hash', 'SHA256': 'hash',
    'email': 'email',
    'ASN': 'asn',
  };
  return map[t] || null;
}

function mapThreat(t: string): ThreatCategory {
  const lower = (t || '').toLowerCase();
  if (lower.includes('malware')) return 'malware';
  if (lower.includes('phish')) return 'phishing';
  if (lower.includes('ransom')) return 'ransomware';
  if (lower.includes('botnet')) return 'botnet';
  return 'unknown';
}

function generateId(value: string, type: IOCType): string {
  const hash = [...value].reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  return `${type}_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

function calculateConfidence(
  source: FeedSource,
  crossSourceHits: number,
  type: IOCType,
  ageHours: number
): number {
  const sourceTrust: Record<string, number> = {
    alienvault: 0.7, urlhaus: 0.8, phishtank: 0.75,
    abusech: 0.9, talos: 0.85, manual: 1.0,
  };
  const typeWeight: Record<string, number> = {
    ip: 0.6, domain: 0.7, url: 0.8, hash: 0.9, email: 0.5, asn: 0.6,
  };
  const trust = sourceTrust[source] || 0.5;
  const cross = Math.min(crossSourceHits / 3, 1) * 0.3;
  const typeW = typeWeight[type] || 0.5;
  const ageFactor = Math.max(0, 1 - ageHours / (7 * 24));
  return Math.round((trust * 0.3 + cross * 0.3 + typeW * 0.2 + ageFactor * 0.2) * 100) / 100;
}

function calculateSeverity(confidence: number): 'low' | 'medium' | 'high' | 'critical' {
  if (confidence >= 0.8) return 'critical';
  if (confidence >= 0.6) return 'high';
  if (confidence >= 0.3) return 'medium';
  return 'low';
}

export async function runFeedIngestion(): Promise<FeedStatus[]> {
  const db = getDb();
  const statuses: FeedStatus[] = [];
  const now = new Date().toISOString();

  const handlers: FeedHandler[] = [
    { source: 'urlhaus', fetch: fetchURLhaus },
    { source: 'phishtank', fetch: fetchPhishTank },
    { source: 'alienvault', fetch: fetchAlienVault },
  ];

  for (const handler of handlers) {
    const sourceRow = db.prepare('SELECT enabled FROM feeds WHERE source = ?').get(handler.source) as { enabled: number } | undefined;
    if (!sourceRow || !sourceRow.enabled) continue;

    const status: FeedStatus = { source: handler.source, lastRun: now, iocsFetched: 0, iocsNew: 0, error: null };

    try {
      const items = await handler.fetch();
      status.iocsFetched = items.length;

      const upsert = db.prepare(`
        INSERT INTO iocs (id, value, type, source, category, confidence, severity, cross_source_hits, first_seen, last_seen, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, '[]')
        ON CONFLICT(value, type) DO UPDATE SET
          cross_source_hits = cross_source_hits + 1,
          last_seen = excluded.last_seen,
          confidence = CASE
            WHEN excluded.last_seen > iocs.last_seen
            THEN MIN(1.0, iocs.confidence + 0.1)
            ELSE iocs.confidence
          END
      `);

      const insertTx = db.transaction(() => {
        for (const item of items) {
          const ageHours = 0;
          const conf = calculateConfidence(handler.source, 1, item.type, ageHours);
          const sev = calculateSeverity(conf);
          const existing = db.prepare('SELECT id, confidence, cross_source_hits, last_seen FROM iocs WHERE value = ? AND type = ?').get(item.value, item.type) as { id: string; confidence: number; cross_source_hits: number; last_seen: string } | undefined;

          if (!existing) {
            const id = generateId(item.value, item.type);
            upsert.run(id, item.value, item.type, handler.source, item.category || 'unknown', conf, sev, now, now);
            status.iocsNew++;
          }
        }
      });

      insertTx();

      db.prepare('UPDATE feeds SET last_run = ?, error = NULL, iocs_fetched = ?, iocs_new = ? WHERE source = ?')
        .run(now, status.iocsFetched, status.iocsNew, handler.source);
    } catch (err: any) {
      status.error = err.message;
      db.prepare('UPDATE feeds SET last_run = ?, error = ? WHERE source = ?').run(now, err.message, handler.source);
    }

    statuses.push(status);
  }

  db.close();
  return statuses;
}

if (process.argv[1]?.endsWith('runner.ts') || process.argv[1]?.endsWith('runner.js')) {
  runFeedIngestion().then((statuses) => {
    console.log('[iris] Feed ingestion complete:');
    for (const s of statuses) {
      console.log(`  ${s.source}: ${s.iocsNew} new / ${s.iocsFetched} total${s.error ? ` ERROR: ${s.error}` : ''}`);
    }
  }).catch(console.error);
}
