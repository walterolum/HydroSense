# HYDROSENSE Production Debugging & Stabilization Checklist

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│   Backend    │────▶│  AI Service  │
│  React/Vite  │     │  Express.js  │     │  FastAPI     │
│  :3000       │◀────│  :5000       │◀────│  :8000       │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │                      │
                            ▼                      ▼
                     ┌──────────────┐     ┌──────────────────┐
                     │  SQLite DB   │     │  Gemini API      │
                     │  (WAL mode)  │     │  (optional)      │
                     └──────────────┘     └──────────────────┘
```

**Communication flow:**
- Frontend → Backend: `/api/*` via Axios (proxied through Vite in dev)
- Frontend → AI: `/ai/*` via Axios (proxied through Vite in dev)
- Backend → AI: `http://localhost:8000/ai/*` via http.request
- Socket.IO: Bidirectional real-time between Backend ↔ Frontend

---

## 1. ROOT CAUSE ANALYSIS: "Offline" / "Retry" / "Failed to Connect" Errors

### 1.1 Backend Not Running
**Symptoms:** Frontend shows "Backend offline", API calls return 502 from Vite proxy.

**Check:**
```powershell
# Is the backend process running?
Get-Process -Name "node" -ErrorAction SilentlyContinue
netstat -ano | findstr ":5000"

# Can you reach the backend directly?
Invoke-RestMethod -Uri "http://localhost:5000/api/health-check" -TimeoutSec 5
```

**Root causes:**
- Port 5000 already in use (run `netstat -ano | findstr ":5000"` to check)
- SQLite native module (`better-sqlite3`) not compiled for this Node.js version
- Missing `node_modules` (run `cd server && npm install`)
- JavaScript syntax error in route files

**Fix:**
```powershell
cd server
npm rebuild better-sqlite3
node -e "require('better-sqlite3')"   # Must not error
node index.js                          # Test manually
```

### 1.2 AI Service Not Running
**Symptoms:** AI returns "offline", health check fails, `/ai/health` returns connection refused.

**Check:**
```powershell
# Is the AI service running?
netstat -ano | findstr ":8000"

# Can you reach it directly?
Invoke-RestMethod -Uri "http://localhost:8000/ai/health" -TimeoutSec 5

# Check the AI service log
Get-Content "ai-service\ai_service.log" -Tail 50
```

**Root causes:**
- Python not found or wrong version (3.8+ required)
- Virtual environment broken (path changed, Python version changed)
- Missing Python packages (`fastapi`, `uvicorn`, etc.)
- `.env` file missing (no `GEMINI_API_KEY` → rule-based mode still works)
- Database path incorrect (`DB_PATH` in `.env` points to wrong location)
- SQLite database not seeded (run `cd server && node seed.js`)
- Startup race condition: Backend checks AI health before AI is ready

**Fix:**
```powershell
cd ai-service
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -c "import fastapi, uvicorn; print('OK')"
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 1.3 AI Gemini API Failures
**Symptoms:** Chat returns "Failed to connect", streaming stops mid-response, quota errors.

**Check:**
```powershell
# Check if API key is configured
Get-Content "ai-service\.env"

# Test Gemini API directly
$key = (Get-Content "ai-service\.env" | Select-String "GEMINI_API_KEY=(.*)").Matches.Groups[1].Value
Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=$key" `
  -Method Post -Body '{"contents":[{"parts":[{"text":"Say hello"}]}]}' -ContentType "application/json"
```

**Root causes:**
- Invalid or expired Gemini API key
- Quota exceeded (free tier: 60 requests/minute)
- Network blocking Google APIs (corporate VPN, firewall)
- Timeout on Gemini's streaming endpoint

### 1.4 CORS Errors
**Symptoms:** Browser console shows CORS errors, requests blocked.

**Vite dev proxy handles this, but verify:**
```typescript
// client/vite.config.ts — these proxies must match the backend ports:
proxy: {
  '/api': { target: 'http://localhost:5000', changeOrigin: true },
  '/socket.io': { target: 'http://localhost:5000', ws: true },
  '/ai': { target: 'http://localhost:8000', changeOrigin: true }
}
```

**Direct API calls** (if bypassing proxy) require CORS headers:
```javascript
// server/index.js — CORS config
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// ai-service/main.py — CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
)
```

### 1.5 Database Connectivity Issues
**Symptoms:** Endpoints return 500, health check shows `database: 'error'`.

**Check:**
```powershell
# Verify the database file exists
Test-Path "server\watermonitor.db"

# Check SQLite integrity
cd server
node -e "const db=require('better-sqlite3')('watermonitor.db'); db.pragma('integrity_check').forEach(r=>console.log(r)); db.close()"
```

**Root causes:**
- Database file missing (run `cd server && node seed.js`)
- Database locked (WAL mode should prevent this — check `watermonitor.db-wal` and `watermonitor.db-shm`)
- Permission issues (OneDrive sync locks the file — **CRITICAL** on Windows)
- Path resolution: AI service resolves `DB_PATH` relative to `ai-service/`, Backend resolves relative to `server/`

---

## 2. STARTUP SEQUENCE DEBUGGING

### 2.1 Correct Startup Order
1. **Backend (server/index.js)** — Must start first (port 5000)
2. **AI Service (ai-service/main.py)** — Starts independently (port 8000)
3. **Frontend (Vite dev server)** — Should wait for backend readiness (port 3000)

### 2.2 Startup Race Conditions

| Symptom | Cause | Fix |
|---------|-------|-----|
| Frontend loads but API calls fail | Frontend started before backend | Wait for `/api/health-check` before starting frontend (start.bat step 5) |
| AI shows "offline" on dashboard | No AI service on port 8000 | Start AI service first or let auto-recovery handle it |
| Backend starts but AI health check fails | Backend's `initialAIDetection()` runs before AI is ready | Retry logic already built in (10 attempts, exponential backoff) |
| Socket.IO connection fails | Frontend connects before Socket.IO server is ready | Socket.IO client auto-reconnects by default |

### 2.3 Manual Startup Test
```powershell
# Terminal 1: Backend
cd server
$env:PORT=5000; $env:NODE_ENV="development"; node index.js

# Terminal 2: AI Service
cd ai-service
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Frontend
cd client
npm run dev

# Terminal 4: Health Checks
Invoke-RestMethod http://localhost:5000/api/health-check
Invoke-RestMethod http://localhost:8000/ai/health
Invoke-RestMethod http://localhost:3000
```

---

## 3. AI SERVICE LIFE CYCLE

### 3.1 Deployment States

| State | Description | How to Enter | How to Exit |
|-------|-------------|-------------|-------------|
| `disconnected` | Fresh start, no DB or connections | Initial launch | `set_state(CONNECTED)` in startup |
| `connected` | Normal operation | Successful startup | Health check failure |
| `degraded` | Running but with issues (DB down) | Health monitor detects DB failure | Successful health check |
| `reconnecting` | Auto-recovery in progress | Backend's `attemptAIAutoRecovery()` | Service comes back online |

### 3.2 Monitoring Endpoints
```
GET /ai/health        — Full health status with uptime, DB status, capabilities
GET /ai/startup-checks — Startup validation results (Python, DB, modules, SQLite WAL)
GET /ai/diagnostics    — Metrics: request count, latency, error rates
GET /ai/diagnostics/report — Formatted diagnostics report
GET /ai/system/ping    — Lightweight liveness check
```

### 3.3 Auto-Recovery Mechanism
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Health Check │────▶│ 3+ failures  │────▶│ Auto-Recovery│
│ (15s interval)│    │              │    │ (exponential  │
└──────────────┘     └──────────────┘     │  backoff)    │
                                          └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │ Spawn uvicorn │
                                          │ process      │
                                          └──────────────┘
```

**Recovery parameters (server/index.js):**
- `HEALTH_CHECK_INTERVAL_MS`: 15000 (check every 15s)
- `MAX_RECOVERY_ATTEMPTS`: 10 (max restarts)
- `RECOVERY_COOLDOWN_MS`: 30000 (min 30s between attempts)
- `baseRetryDelayMs`: 1000 (starts at 1s, doubles each attempt)
- `maxRetryDelayMs`: 60000 (caps at 60s)

---

## 4. TROUBLESHOOTING COMMANDS (Windows)

### 4.1 Port Management
```powershell
# Find what's using a port
netstat -ano | findstr ":5000"
netstat -ano | findstr ":8000"
netstat -ano | findstr ":3000"

# Kill a process by PID
taskkill /f /pid 12345

# Kill all node processes (use with caution)
taskkill /f /im node.exe
```

### 4.2 Python Environment
```powershell
# Check Python version
python --version
python -c "import sys; print(sys.executable)"

# Rebuild virtual environment
cd ai-service
rmdir /s /q .venv
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

# Check installed packages
.venv\Scripts\python.exe -m pip list

# Test imports
.venv\Scripts\python.exe -c "import fastapi, uvicorn, httpx, dotenv, PIL; print('All OK')"

# Check database path resolution
.venv\Scripts\python.exe -c "import os; print(os.path.abspath(os.getenv('DB_PATH', '../server/watermonitor.db')))"
```

### 4.3 Node.js Environment
```powershell
# Check Node version
node --version

# Rebuild native modules
cd server
npm rebuild

# Check SQLite module
node -e "require('better-sqlite3')"
node -e "const db=require('better-sqlite3')('watermonitor.db'); console.log(db.pragma('journal_mode')); db.close()"
```

### 4.4 Network Diagnostics
```powershell
# Test connectivity between services
Invoke-RestMethod http://localhost:5000/api/health-check -TimeoutSec 5
Invoke-RestMethod http://localhost:8000/ai/health -TimeoutSec 5
Invoke-RestMethod http://localhost:3000 -TimeoutSec 5

# Test Gemini API (if key configured)
$env:GEMINI_API_KEY = "your-key-here"
$body = @{contents=@(@{parts=@(@{text="Say hello"})})} | ConvertTo-Json
Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=$env:GEMINI_API_KEY" `
  -Method Post -Body $body -ContentType "application/json"

# Check if OneDrive is interfering
Get-Process -Name "OneDrive" -ErrorAction SilentlyContinue
# If running, pause/resume OneDrive sync
```

### 4.5 OneDrive Conflict Resolution
Since the project is on OneDrive, file locks can cause issues:
```powershell
# Check for locked files
& "C:\Users\Personal\AppData\Local\Microsoft\OneDrive\OneDrive.exe" /shutdown
# Wait 30 seconds, then restart
& "C:\Users\Personal\AppData\Local\Microsoft\OneDrive\OneDrive.exe"

# Or exclude the project folder from OneDrive sync
# Right-click OneDrive icon → Settings → Account → Choose folders → Uncheck project
```

---

## 5. API TESTING GUIDE

### 5.1 Backend API Tests
```powershell
# Health
Invoke-RestMethod http://localhost:5000/api/health-check

# System Status
Invoke-RestMethod http://localhost:5000/api/system/status

# Auth (test login)
$login = @{email="admin@mwe.go.ug"; password="password123"} | ConvertTo-Json
$token = (Invoke-RestMethod -Uri http://localhost:5000/api/auth/login -Method Post -Body $login -ContentType "application/json").token

# Water Points (authenticated)
$headers = @{Authorization="Bearer $token"}
Invoke-RestMethod http://localhost:5000/api/waterpoints -Headers $headers

# Sensors
Invoke-RestMethod http://localhost:5000/api/sensors -Headers $headers

# Alerts
Invoke-RestMethod http://localhost:5000/api/alerts -Headers $headers

# All routes — check none return 500
$routes = @("waterpoints","sensors","alerts","reports","maintenance","analytics","governance","health","climate","quality","gwn","incidents","citizen","notifications")
foreach ($r in $routes) {
    try {
        $resp = Invoke-RestMethod "http://localhost:5000/api/$r" -Headers $headers -ErrorAction Stop
        Write-Host "✓ /api/$r" -ForegroundColor Green
    } catch {
        Write-Host "✗ /api/$r : $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

### 5.2 AI Service Tests
```powershell
# Health
Invoke-RestMethod http://localhost:8000/ai/health

# Diagnostics
Invoke-RestMethod http://localhost:8000/ai/diagnostics

# Ping
Invoke-RestMethod http://localhost:8000/ai/system/ping

# Predictions
Invoke-RestMethod http://localhost:8000/ai/predictions/failure

# Chat (non-streaming)
$chatBody = @{message="Hello"; role="citizen"} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/ai/chat -Method Post -Body $chatBody -ContentType "application/json"

# Dashboard
Invoke-RestMethod http://localhost:8000/ai/dashboard/national_admin

# Risk
Invoke-RestMethod http://localhost:8000/ai/risk/live-summary
Invoke-RestMethod http://localhost:8000/ai/risk/district-summaries
```

### 5.3 Frontend Tests
```powershell
# Check Vite dev server
Invoke-RestMethod http://localhost:3000 -TimeoutSec 10

# Check frontend can proxy to backend
Invoke-RestMethod http://localhost:3000/api/health-check -TimeoutSec 10

# Check frontend can proxy to AI
Invoke-RestMethod http://localhost:3000/ai/health -TimeoutSec 10
```

---

## 6. ENVIRONMENT CONFIGURATION

### 6.1 Required Files
```
HYDROSENSE/
├── ai-service/
│   ├── .env                  # GEMINI_API_KEY, DB_PATH, PORT
│   ├── .venv/Scripts/        # Python virtual environment
│   ├── requirements.txt      # fastapi, uvicorn, httpx, python-dotenv, Pillow, sse-starlette
│   └── main.py               # FastAPI application
├── server/
│   ├── index.js              # Express application
│   ├── db.js                 # SQLite database (better-sqlite3)
│   ├── node_modules/         # Node.js packages
│   └── watermonitor.db       # SQLite database file
└── client/
    ├── vite.config.ts        # Vite configuration with proxy
    ├── node_modules/         # React packages
    └── src/                  # React source code
```

### 6.2 Environment Variables
| Variable | Default | Service | Purpose |
|----------|---------|---------|---------|
| `PORT` | 5000 | Backend | HTTP server port |
| `JWT_SECRET` | hardcoded | Backend | JWT signing secret |
| `CORS_ORIGINS` | localhost:3000,5173 | Backend | Allowed CORS origins |
| `GEMINI_API_KEY` | "" | AI Service | Google Gemini API key |
| `DB_PATH` | ../server/watermonitor.db | AI Service | SQLite database path |
| `PORT` | 8000 | AI Service | Uvicorn server port |
| `LOG_LEVEL` | INFO | AI Service | Logging verbosity |

### 6.3 Version Requirements
| Dependency | Minimum | Current |
|------------|---------|---------|
| Node.js | 18.x | (check with `node --version`) |
| Python | 3.8+ | 3.13.12 |
| npm | 9.x | (check with `npm --version`) |
| better-sqlite3 | 12.9.0 | 12.x |
| FastAPI | 0.100.0 | latest |
| uvicorn | 0.20.0 | latest |
| React | 18.2.0 | 18.x |

---

## 7. PRODUCTION DEPLOYMENT RECOMMENDATIONS

### 7.1 For Windows Production
1. **Use Windows Service wrappers** (NSSM) for Backend and AI Service
2. **Set up log rotation** (Windows Event Log or file rotation)
3. **Use a process manager** like `pm2` for Node.js:
   ```powershell
   npm install -g pm2
   pm2 start server/index.js --name hydrosense-backend
   pm2 start ai-service/start.bat --name hydrosense-ai
   pm2 start client/node_modules/.bin/vite --name hydrosense-frontend -- --host
   pm2 save
   ```
4. **Configure Windows Defender** to exclude the project directory
5. **Disable OneDrive sync** for the project folder to prevent file locking

### 7.2 For Linux/Cloud Production
1. Use **Docker Compose** with three services:
   ```yaml
   services:
     backend:
       build: ./server
       ports: ["5000:5000"]
       volumes: ["./server/watermonitor.db:/app/watermonitor.db"]
     ai-service:
       build: ./ai-service
       ports: ["8000:8000"]
       environment: [GEMINI_API_KEY=${GEMINI_API_KEY}]
     frontend:
       build: ./client
       ports: ["80:80"]
   ```
2. Add **NGINX reverse proxy** for unified entry point
3. Use **Gunicorn** instead of Uvicorn for production Python (Uvicorn with workers)
4. Add **Redis** for caching and rate limiting
5. Switch to **PostgreSQL** for concurrent access

### 7.3 Monitoring Stack
- Health endpoint polling (every 15s)
- Centralized logging (ELK stack or similar)
- Metrics dashboard (Prometheus + Grafana)
- Alerting on consecutive health check failures (>3)

---

## 8. COMMON ERROR PATTERNS & FIXES

### Pattern 1: "AI Service Offline" Loop
```
[AI] Hydro AI engine went offline (3 consecutive failures)
[AI] Triggering auto-recovery after 3 failed health checks
[AI Auto-Recovery] Attempt 1/10 - Starting AI service...
[AI Auto-Recovery] AI service exited with code 1
[AI] Hydro AI went offline ...
```

**Fix:**
1. Check if Python is in PATH: `python --version`
2. Check if venv is broken: `ai-service\.venv\Scripts\python.exe --version`
3. Check requirements: `.venv\Scripts\python.exe -m pip install -r requirements.txt`
4. Check the AI service's own stderr output
5. Try starting manually: `.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000`

### Pattern 2: "Retry" Loop on Frontend
```
[Frontend] AI health check failed, retrying in 2s...
[Frontend] AI health check failed, retrying in 5s...
```

**Fix:**
1. Check AI service is running: `netstat -ano | findstr ":8000"`
2. Check direct AI health: `Invoke-RestMethod http://localhost:8000/ai/health`
3. Check Vite proxy config in `vite.config.ts`
4. The frontend health check tries both `/ai/health` and `http://localhost:8000/ai/health`

### Pattern 3: "Failed to Connect"
**Fix:**
1. Check ALL three services are running
2. Check port conflicts: `netstat -ano | findstr ":5000"` etc.
3. Check firewall: `New-NetFirewallRule -DisplayName "HYDROSENSE" -Direction Inbound -Protocol TCP -LocalPort 3000,5000,8000 -Action Allow`
4. Check Vite proxy is forwarding correctly

### Pattern 4: Database Locked / WAL Issues
**Fix:**
```powershell
# Check for WAL files
dir server\watermonitor.db*
# Output: watermonitor.db, watermonitor.db-shm, watermonitor.db-wal

# If db-shm exists but no db is running, it means a crash left WAL in bad state
# Solution: delete WAL files
Remove-Item server\watermonitor.db-shm, server\watermonitor.db-wal -Force
node server\seed.js  # Reseed
```

---

## 9. TESTING EACH SUBSYSTEM INDEPENDENTLY

### Backend Only (no AI, no Frontend)
```powershell
cd server
node index.js
# Test: curl http://localhost:5000/api/health-check
# Test: curl http://localhost:5000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"admin@mwe.go.ug","password":"password123"}'
```

### AI Service Only (no Backend, no Frontend)
```powershell
cd ai-service
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
# Test: curl http://localhost:8000/ai/health
# Test: curl http://localhost:8000/ai/system/ping
# Test: curl http://localhost:8000/ai/predictions/failure
```

### Frontend Only (needs both services for full functionality)
```powershell
cd client
npm run dev
# Opens at http://localhost:3000
# Will show "offline" indicators for services — this is normal
```

---

## 10. VS CODE DEBUGGING SETUP

### Prerequisites
1. Install **Python extension** (for .py debugger)
2. Install **Node.js debugger** (built-in)
3. Open workspace at HYDROSENSE root

### Debug Configurations
Launch configurations are in `.vscode/launch.json`:
- **AI Service (Python)**: Debug FastAPI with auto-reload
- **Backend (Node.js)**: Debug Express with breakpoints
- **Full Stack Debug**: Both services simultaneously

### Quick Debug Steps
1. Open `server/index.js` or `ai-service/main.py`
2. Set breakpoints (F9)
3. Select configuration from dropdown
4. Press F5 to start debugging
5. Make API calls to hit breakpoints

---

## 11. PROFESSIONAL SCALABLE ARCHITECTURE UPGRADE

### 11.1 Current Architecture Limitations

```
                    ┌──────────────┐
                    │  Frontend    │
                    │  React/Vite  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │ /api/*     │ /ai/*      │
              ▼            ▼            │
      ┌──────────────┐ ┌──────────────┐ │
      │  Express.js  │ │  FastAPI     │ │
      │  (port 5000) │ │  (port 8000) │ │
      └──────┬───────┘ └──────────────┘ │
             │                          │
             ▼                          │
      ┌──────────────┐                 │
      │  SQLite       │◄────────────────┘
      │  (single file)│
      └──────────────┘
```

**Problems:**
1. **SQLite single-file DB** — No concurrent write support, OneDrive locks, crashes on WAL corruption
2. **Dual-path to AI** — Frontend can reach AI directly (port 8000) OR through Express proxy (port 5000) — inconsistent
3. **No message queue** — Requests dropped if AI service is restarting
4. **No connection pooling** — SQLite opened/closed per request in some code paths
5. **No caching layer** — Every dashboard load re-queries the DB
6. **Process management** — Backend spawns AI as child process, fragile on Windows
7. **No API gateway** — CORS, rate limiting, auth duplicated across services

### 11.2 Recommended Target Architecture

```
                           ┌─────────────┐
                           │   Client    │
                           │  React SPA  │
                           └──────┬──────┘
                                  │
                           ┌──────▼──────┐
                           │  NGINX/Gateway  │
                           │  - TLS termination  │
                           │  - Rate limiting    │
                           │  - Request routing  │
                           │  - /api/* → backend │
                           │  - /ai/*  → AI svc  │
                           └──────┬──────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
       ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
       │  Express.js  │    │   Redis     │    │  FastAPI    │
       │  API Server  │    │  Cache/Q    │    │  AI Service │
       │  (scalable)  │    │  Pub/Sub    │    │  (workers)  │
       └──────┬──────┘    └─────────────┘    └──────┬──────┘
              │                                     │
       ┌──────▼──────┐                      ┌──────▼──────┐
       │  PostgreSQL │                      │  Gemini API │
       │  (or MySQL) │                      │  (external) │
       └─────────────┘                      └─────────────┘
```

### 11.3 Phased Migration Plan

**Phase 1: Immediate (1-2 days) — Done in this upgrade**
- ✓ Fix proxy route wildcard matching
- ✓ Fix `spawn` → `execFileSync` for Python detection
- ✓ Add `X-Request-ID` correlation across all layers
- ✓ Fix streaming error handler in ChatBot
- ✓ Add shared httpx client for connection pooling
- ✓ Fix timeout alignment (55s everywhere)
- ✓ Fix status messages (no more fake "online" indicators)

**Phase 2: Short-term (1-2 weeks)**
1. **Replace SQLite with PostgreSQL**
   - Use `pg` (Node) and `asyncpg`/`psycopg2` (Python)
   - Migration script to export SQLite → PostgreSQL
   - Connection pool (10-20 connections per service)

2. **Add Redis layer**
   - Cache: AI predictions, dashboard data (TTL 30-60s)
   - Queue: AI requests via Redis List (RPUSH/BPOP)
   - Pub/Sub: real-time sensor updates replace some Socket.IO

3. **Add NGINX reverse proxy**
   ```nginx
   server {
       listen 443 ssl;
       location /api/ { proxy_pass http://backend:5000; }
       location /ai/  { proxy_pass http://ai-service:8000; }
       location /     { proxy_pass http://frontend:3000; }
   }
   ```

**Phase 3: Medium-term (2-4 weeks)**
1. **Containerize with Docker**
   - `docker-compose.yml` with backend, ai-service, redis, postgres, nginx
   - Health checks, restart policies, volume mounts

2. **Process manager**
   - PM2 for Node.js (cluster mode: `pm2 start index.js -i max`)
   - Gunicorn for Python (`gunicorn -w 4 main:app`)

3. **Monitoring stack**
   - Prometheus metrics endpoints
   - Grafana dashboards
   - ELK for log aggregation

**Phase 4: Long-term (1-2 months)**
1. **Horizontal scaling**
   - Stateless backend → multiple Express instances behind NGINX
   - AI service workers (4-8) behind load balancer
   - Sticky sessions for WebSocket

2. **Kubernetes deployment**
   - Deployments, Services, Ingress
   - HPA (Horizontal Pod Autoscaler) based on CPU/memory
   - ConfigMaps for environment variables

3. **CI/CD pipeline**
   - GitHub Actions → build → test → deploy
   - Blue-green deployment for zero-downtime

### 11.4 Redis Queue Pattern (Replace `/ai/chat/stream`)

Current: `Frontend → Express proxy → FastAPI → Gemini → stream back`

Recommended:
```
Frontend → POST /api/ai/chat
  → Express writes to Redis List "ai:requests"
  → FastAPI worker consumes from list
  → Gemini processes request
  → Express polls Redis key "ai:response:{id}"
  → Frontend polls GET /api/ai/status/{id}
```

Benefits:
- Requests survive AI service restarts
- Backpressure via bounded Redis list
- No streaming complexity
- Retry logic simplified

### 11.5 Testing Each Subsystem Independently

**Backend only** (no AI, no Frontend):
```powershell
cd server
$env:PORT=5000; node index.js
# Test all API routes without AI dependency
Invoke-RestMethod http://localhost:5000/api/health-check
Invoke-RestMethod http://localhost:5000/api/waterpoints -Headers @{Authorization="Bearer $token"}
```

**AI Service only** (no Backend, no Frontend):
```powershell
cd ai-service
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
# All AI functions work independently
Invoke-RestMethod http://localhost:8000/ai/health
Invoke-RestMethod http://localhost:8000/ai/predictions/failure
Invoke-RestMethod http://localhost:8000/ai/chat -Method Post `
  -Body '{"message":"Hello","role":"citizen"}' -ContentType "application/json"
```

**Frontend only** (needs mock data):
```powershell
cd client
npm run dev
# Frontend shows "offline" indicators — designed to work partially
```

**End-to-end validation:**
```powershell
# 1. Backend health
Invoke-RestMethod http://localhost:5000/api/health-check

# 2. AI service health (direct)
Invoke-RestMethod http://localhost:8000/ai/health

# 3. AI service health (via Express proxy — tests proxy path)
Invoke-RestMethod http://localhost:5000/api/ai/health

# 4. Chat via proxy (tests wildcard route + body forwarding)
Invoke-RestMethod http://localhost:5000/api/ai/chat -Method Post `
  -Body '{"message":"How many water points?","role":"citizen"}' -ContentType "application/json"

# 5. Chat stream via proxy
Invoke-RestMethod http://localhost:5000/api/ai/chat/stream -Method Post `
  -Body '{"message":"Hello","role":"citizen"}' -ContentType "application/json"

# 6. Frontend serves SPA
Invoke-RestMethod http://localhost:3000

# 7. Frontend proxies to backend
Invoke-RestMethod http://localhost:3000/api/health-check

# 8. Frontend proxies to AI
Invoke-RestMethod http://localhost:3000/ai/health
```

### 11.6 Startup Verification Script

```powershell
# test-all.ps1 — verify all subsystems
$errors = @()

# Backend
try { $r = Invoke-RestMethod http://localhost:5000/api/health-check -TimeoutSec 5; Write-Host "✓ Backend" -ForegroundColor Green }
catch { $errors += "Backend"; Write-Host "✗ Backend: $_" -ForegroundColor Red }

# AI Service (direct)
try { $r = Invoke-RestMethod http://localhost:8000/ai/health -TimeoutSec 5; Write-Host "✓ AI Service" -ForegroundColor Green }
catch { $errors += "AI Service"; Write-Host "✗ AI Service: $_" -ForegroundColor Red }

# AI Service (via proxy)
try { $r = Invoke-RestMethod http://localhost:5000/api/ai/health -TimeoutSec 10; Write-Host "✓ AI Proxy" -ForegroundColor Green }
catch { $errors += "AI Proxy"; Write-Host "✗ AI Proxy: $_" -ForegroundColor Red }

# Frontend
try { $r = Invoke-RestMethod http://localhost:3000 -TimeoutSec 10; Write-Host "✓ Frontend" -ForegroundColor Green }
catch { $errors += "Frontend"; Write-Host "✗ Frontend: $_" -ForegroundColor Red }

# Chat via proxy (end-to-end)
$body = @{message="Hello"; role="citizen"; history=@()} | ConvertTo-Json
try { $r = Invoke-RestMethod "http://localhost:5000/api/ai/chat" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60; Write-Host "✓ Chat E2E" -ForegroundColor Green }
catch { $errors += "Chat E2E"; Write-Host "✗ Chat E2E: $_" -ForegroundColor Red }

if ($errors.Count -eq 0) { Write-Host "`n✅ All subsystems operational" -ForegroundColor Green }
else { Write-Host "`n❌ Failed: $($errors -join ', ')" -ForegroundColor Red }
```

## 12. REBRANDING: Hydrasense → HydroSense

**Complete platform rebrand executed across 14+ files, 145+ references:**

| Old | New | Scope |
|-----|-----|-------|
| HYDRASENSE | HYDROSENSE | UI text, titles, footers, console logs, API docs |
| Hydrasense | HydroSense | Link text, comments |
| HYDRA (assistant) | Hydro AI | AI name, chatbot branding, status indicators |
| HYDRA v4.0 | Hydro AI v4.0 | Model version strings |
| hydra.chatbot | hydrosense.chatbot | Python logger names |

## 13. POST-UPGRADE: NEW FEATURES & FIXES

### 13.1 Critical Bugs Fixed

| Bug | File | Fix |
|-----|------|-----|
| Express wildcard `/api/ai/*` only matched single-level paths | `server/index.js` | Changed to `/:path(*)` for multi-level capture |
| `findPython()` used async `spawn` synchronously — always failed | `server/index.js` | Replaced with `execFileSync` for proper sync detection |
| `attemptAIAutoRecovery()` deps check used async `spawn` synchronously | `server/index.js` | Replaced with `execFileSync` |
| AI proxy timeout (8s) didn't match frontend timeout (60s) | `server/index.js` | Raised to 55s to allow Gemini time |
| Stream error handler had incomplete try/catch — syntax error | `ChatBot.tsx` lines 347-363 | Added proper catch block with fallback handling |
| AI service created new `httpx.AsyncClient` per request — connection leak | `chatbot.py` | Shared module-level client via `get_http_client()` |
| Status messages showed "AI Services Operational" when offline | `AIServiceContext.tsx` | Changed to "AI Service Offline" / "Reconnecting..." |
| Offline indicator showed green dot + "AI Services Operational" | `ChatBot.tsx` | Changed to red dot + "AI Service Offline" |
| No request tracing across frontend→proxy→AI service | Multiple | Added `X-Request-ID` propagation across all layers |
| No circuit breaker for Gemini API calls — cascading failures | `main.py` | Added `CircuitBreaker` (threshold=3, recovery=30s) |

### 13.2 New Production Features

| Feature | File | Description |
|---------|------|-------------|
| Circuit Breaker | `main.py` | Gemini API protected by circuit breaker — 3 failures trips to OPEN, 30s recovery |
| Gemini CB status in health | `main.py` | `/ai/health` returns `circuit_breaker.gemini.state` |
| Auth redirect-after-login | `App.tsx` | `ProtectedRoute` saves `location.pathname`, Login redirects back |
| Circuit breaker fallback | `main.py` | When CB open → returns rule-based response immediately |
| Unified logging prefix | `main.py` | `[HYDROSENSE AI]` instead of `[Hydro AI]` |

### 13.3 Request Tracing (New)

Every request now carries an `X-Request-ID` header across the full lifecycle:

```
Frontend (aiClient.ts) → Express Proxy (index.js) → FastAPI (main.py)
  fe_1712345678_abc       req_12345678               request_id from header
```

To trace a specific request end-to-end:
```powershell
# Frontend captures request IDs in diagnostics
# Check the browser console AI diagnostics

# Backend logs include request ID
# [fe_1712345678_abc] POST /api/ai/chat → 200 3421ms

# AI service logs include request ID
# [req_12345678] Processing chat request (role=citizen, has_image=False)
```

### 13.4 Debugging "Retry Request" — Root Cause Flow

```
User sends message
  → ChatBot.executeSend()
    → sendChatMessageStream() via fetch to /ai/chat/stream
      → Vite proxy → Circuit Breaker check (CLOSED?) → FastAPI /ai/chat/stream
        → call_gemini_stream() → httpx shared client → Gemini API
          └── FAILURE: timeout / network / quota / 503
            → Circuit Breaker records failure → OPEN after 3 failures
            → Stream error handler → Attempts non-streaming fallback → SUCCESS
              → Returns rule-based response
```

### 13.5 Immediate Actions if "Retry Request" Appears

```powershell
# 1. Check AI service health directly (includes circuit breaker status)
Invoke-RestMethod http://localhost:8000/ai/health -TimeoutSec 10 | ConvertTo-Json

# 2. Check if Gemini key is valid
$key = (Select-String -Path ai-service/.env -Pattern "GEMINI_API_KEY=(.*)").Matches.Groups[1].Value
Invoke-RestMethod "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=$key" -Method Post -Body '{"contents":[{"parts":[{"text":"hi"}]}]}' -ContentType "application/json"

# 3. Check circuit breaker state
(Invoke-RestMethod http://localhost:8000/ai/health).circuit_breaker

# 4. Check frontend can reach AI via proxy
Invoke-RestMethod http://localhost:3000/ai/health -TimeoutSec 10

# 5. Check the proxy logs for request IDs
# Backend console: [fe_xxx] POST /api/ai/chat/stream → 200 1234ms

# 6. Check if AI service reached quota (429)
# Look for "quota_exceeded" in AI service logs
```

### 13.6 Verifying the Fixes

```powershell
# Test request propagation
$headers = @{"X-Request-ID"="test_001"}
Invoke-RestMethod http://localhost:5000/api/ai/health -Headers $headers -TimeoutSec 10

# Test multi-level proxy path (was broken before fix)
Invoke-RestMethod http://localhost:5000/api/ai/chat -Method Post -Body '{"message":"hello","role":"citizen"}' -ContentType "application/json"

# Test stream endpoint through proxy
Invoke-RestMethod http://localhost:5000/api/ai/chat/stream -Method Post -Body '{"message":"hello","role":"citizen"}' -ContentType "application/json"

# Verify health check passes through proxy
Invoke-RestMethod http://localhost:5000/api/ai/health -TimeoutSec 10 | ConvertTo-Json
```

### 13.7 Circuit Breaker Testing

```powershell
# Check circuit breaker status
(Invoke-RestMethod http://localhost:8000/ai/health).circuit_breaker

# Simulate failures (if you can trigger Gemini errors):
# After 3 failures, circuit opens → health shows "degraded"
# After 30s recovery timeout → circuit half-open → test call → closes on success

# When circuit is OPEN, chat requests return rule-based responses immediately
# without hitting Gemini API (fail-fast behavior)
```

> **Author**: AI Systems Engineering Team
> **Version**: 4.0 (Full Upgrade)
> **Last Updated**: 2026-05-13
