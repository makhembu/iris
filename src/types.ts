export type IOCType = 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'asn';

export type FeedSource = 'alienvault' | 'urlhaus' | 'phishtank' | 'abusech' | 'talos' | 'manual';

export type ThreatCategory =
  | 'malware'
  | 'phishing'
  | 'botnet'
  | 'ransomware'
  | 'scanning'
  | 'exploit'
  | 'spam'
  | 'unknown';

export interface RawIOC {
  value: string;
  type: IOCType;
  source: FeedSource;
  category?: ThreatCategory;
  description?: string;
  firstSeen?: string;
  reference?: string;
  tags?: string[];
}

export interface IOC extends RawIOC {
  id: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  crossSourceHits: number;
  lastSeen: string;
  enriched: boolean;
  enrichmentData?: Record<string, unknown>;
}

export interface FeedStatus {
  source: FeedSource;
  lastRun: string | null;
  iocsFetched: number;
  iocsNew: number;
  error: string | null;
}

export interface SearchQuery {
  q?: string;
  type?: IOCType;
  severity?: string;
  source?: FeedSource;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  iocs: IOC[];
  total: number;
  query: SearchQuery;
}
