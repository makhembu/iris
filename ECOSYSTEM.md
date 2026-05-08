# Iris Ecosystem — Full Stack Guide

Five projects that work together as a threat detection pipeline. Below is when to use each, what port it runs on, and how to run the full stack end-to-end.

## Port Map

| Project | Port | Purpose |
|---------|------|---------|
| [iris](https://github.com/makhembu/iris) | **3000** | IOC aggregation & API |
| [sentry](https://github.com/makhembu/sentry) | **3001** | Detection rule matching |
| [phishkit](https://github.com/makhembu/phishkit) | **3002** | Phishing URL analysis |
| [packetwatch](https://github.com/makhembu/packetwatch) | **3003** | Network anomaly detection |
| [trace](https://github.com/makhembu/trace) | **3004** | Incident timeline correlation |

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

## Full Stack Startup (Windows)

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
```

## End-to-End Demo

```powershell
# 1. Ingest threat feeds into iris
curl -X POST http://localhost:3000/feeds/ingest

# 2. Check what IOCs were collected
curl http://localhost:3000/iocs?severity=high

# 3. Reload rules and run matching in sentry
curl -X POST http://localhost:3001/rules/reload
curl -X POST http://localhost:3001/match/run

# 4. Check if any rules fired
curl "http://localhost:3001/findings?acknowledged=false"

# 5. Submit a suspicious URL to phishkit
curl -X POST http://localhost:3002/analyze `
  -H "Content-Type: application/json" `
  -d '{"url": "https://secure-login-paypal.com.verify-account.tk/login"}'

# 6. Feed metrics into packetwatch
curl -X POST http://localhost:3003/metrics `
  -H "Content-Type: application/json" `
  -d '{"source": "edge_sensor", "metricType": "bytes_in", "value": 10485760}'

# 7. Ingest everything into trace
curl -X POST http://localhost:3004/ingest/all

# 8. Correlate events into incidents
curl -X POST http://localhost:3004/correlate

# 9. View incidents
curl http://localhost:3004/incidents?status=open

# 10. Export the full timeline
curl http://localhost:3004/export
```

## Testing

Each project has tests using Node's native test runner:

```bash
cd <project>
npm test
```
