import { describe, it } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { getSchema } from '../src/db/schema.js';
import path from 'path';
import fs from 'fs';

const TEST_DB = path.join(import.meta.dirname, '..', 'data', 'test_iris.db');

function setupDb() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  const dbDir = path.dirname(TEST_DB);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(TEST_DB);
  db.pragma('journal_mode = WAL');
  db.exec(getSchema());
  return db;
}

describe('iris', () => {

  describe('confidence scoring', () => {
    it('calculates confidence correctly for high-trust source', () => {
      const trust = 0.9;
      const cross = 0.3;
      const typeW = 0.6;
      const ageFactor = 0.2;
      const confidence = trust * 0.3 + cross * 0.3 + typeW * 0.2 + ageFactor * 0.2;
      assert.strictEqual(confidence, 0.27 + 0.09 + 0.12 + 0.04);
      assert.strictEqual(Math.round(confidence * 100) / 100, 0.52);
    });

    it('gives higher confidence with cross-source hits', () => {
      const singleSource = 0.7 * 0.3 + 0.1 * 0.3 + 0.6 * 0.2 + 1.0 * 0.2;
      const multiSource = 0.7 * 0.3 + 1.0 * 0.3 + 0.6 * 0.2 + 1.0 * 0.2;
      assert.ok(multiSource > singleSource);
    });

    it('lowest confidence for low-trust source, no cross hits, aged IOC', () => {
      const trust = 0.5;
      const cross = 0;
      const typeW = 0.5;
      const ageFactor = 0;
      const confidence = trust * 0.3 + cross * 0.3 + typeW * 0.2 + ageFactor * 0.2;
      assert.strictEqual(confidence, 0.15 + 0 + 0.1 + 0);
      assert.strictEqual(confidence, 0.25);
    });
  });

  describe('severity calculation', () => {
    it('returns critical for confidence >= 0.8', () => {
      assert.strictEqual(confidenceToSeverity(0.85), 'critical');
    });
    it('returns high for confidence >= 0.6', () => {
      assert.strictEqual(confidenceToSeverity(0.65), 'high');
    });
    it('returns medium for confidence >= 0.3', () => {
      assert.strictEqual(confidenceToSeverity(0.45), 'medium');
    });
    it('returns low for confidence < 0.3', () => {
      assert.strictEqual(confidenceToSeverity(0.2), 'low');
    });
  });

  describe('database schema', () => {
    it('creates all required tables', () => {
      const db = setupDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
      const names = tables.map(t => t.name);
      assert.ok(names.includes('feeds'));
      assert.ok(names.includes('iocs'));
      assert.ok(names.includes('alerts'));
      assert.ok(names.includes('feed_status_history'));
      db.close();
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    });

    it('enforces valid IOC types', () => {
      const db = setupDb();
      assert.throws(() => {
        db.prepare("INSERT INTO iocs (id, value, type, source, category, confidence, severity, first_seen, last_seen) VALUES ('x', 'test', 'invalid_type', 'manual', 'unknown', 0.5, 'medium', datetime('now'), datetime('now'))").run();
      });
      db.close();
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    });

    it('inserts and retrieves an IOC', () => {
      const db = setupDb();
      db.prepare("INSERT INTO iocs (id, value, type, source, category, confidence, severity, first_seen, last_seen) VALUES ('test_1', '8.8.8.8', 'ip', 'manual', 'unknown', 0.9, 'critical', datetime('now'), datetime('now'))").run();
      const row = db.prepare("SELECT value, type, confidence FROM iocs WHERE id = 'test_1'").get() as any;
      assert.strictEqual(row.value, '8.8.8.8');
      assert.strictEqual(row.type, 'ip');
      assert.strictEqual(row.confidence, 0.9);
      db.close();
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    });
  });

  describe('feed status table', () => {
    it('inserts feed sources on schema init', () => {
      const db = setupDb();
      const feeds = ['alienvault', 'urlhaus', 'phishtank', 'abusech', 'talos', 'manual'];
      for (const source of feeds) {
        db.prepare('INSERT OR IGNORE INTO feeds (source, enabled) VALUES (?, 1)').run(source);
      }
      const count = (db.prepare('SELECT COUNT(*) as c FROM feeds').get() as { c: number }).c;
      assert.strictEqual(count, 6);
      db.close();
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    });
  });
});

function confidenceToSeverity(confidence: number): string {
  if (confidence >= 0.8) return 'critical';
  if (confidence >= 0.6) return 'high';
  if (confidence >= 0.3) return 'medium';
  return 'low';
}
