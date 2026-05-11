# GhostGrab — Cloud Hosting Specification

> This document covers exact infrastructure requirements, provider recommendations,
> Docker deployment, and security hardening for hosting GhostGrab in production.

---

## Minimum System Requirements

| Resource | Minimum | Recommended | Why |
|---|---|---|---|
| **CPU** | 2 vCPU | 4 vCPU | FFmpeg encoding is CPU-bound; 1 vCPU will bottleneck |
| **RAM** | 2 GB | 4 GB | FFmpeg buffers 200–500 MB per encode; Python + uvicorn use ~300 MB |
| **Disk** | 30 GB | 80 GB | Batch of 200 × 100 MB = 20 GB raw + encoded simultaneously; OS + app = 5 GB |
| **Network (in)** | 100 Mbps | 1 Gbps | 50 MB video on 100 Mbps = ~4s; 10 Mbps = 40s wait |
| **Network (out)** | 50 Mbps | 500 Mbps | File serving to browser download |
| **OS** | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS | FFmpeg packages are most stable here |

### Storage Breakdown (Worst Case)

```
App code + dependencies        ~  500 MB
Python venv                    ~  300 MB
Sessions (during batch)        ~ 20 GB  (200 videos × 100 MB each, auto-cleaned)
yt-dlp cache                   ~  100 MB (auto-purged after each job)
OS + logs                      ~  5 GB
──────────────────────────────────────
Total required                 ~ 27 GB  → provision 30 GB minimum, 80 GB recommended
```

---

## Provider Comparison

| Provider | Plan | Cost/month | vCPU | RAM | Disk | Suitable? |
|---|---|---|---|---|---|---|
| **Hetzner Cloud** (EU) | CX21 | €4.51 (~$5) | 2 | 4 GB | 40 GB | ✅ **Best value** |
| **Railway** | Hobby | $5 + usage | 2 | 8 GB | Volumes available | ✅ Great DX |
| **DigitalOcean** | Basic Droplet | $12 | 2 | 2 GB | 50 GB SSD | ✅ Reliable |
| **Fly.io** | shared-cpu-2x | ~$10 | 2 | 1 GB | Volume add-on | ✅ Fast deploys |
| **Render** | Standard | $25 | 2 | 2 GB | +10 GB add-on | ⚠️ Needs disk add-on |
| **Render** | Free | $0 | 0.1 | 512 MB | None (ephemeral) | ❌ Too slow + no disk |
| **Vercel** | Any | Any | N/A | N/A | N/A | ❌ Cannot run GhostGrab |
| **AWS EC2** | t3.medium | ~$33 | 2 | 4 GB | EBS add-on | ✅ Enterprise, overkill |

### Why Vercel Cannot Work

Vercel is a **serverless** platform. GhostGrab requires:
- Background threads (downloads run 30–120 seconds) — **Vercel max timeout: 10s**
- FFmpeg as a system binary — **Vercel has no system packages**
- A persistent `sessions/` directory — **Vercel filesystem is read-only**

### Why Render Free Cannot Work

The free tier has:
- 512 MB RAM (FFmpeg needs ~300 MB per encode — too tight)
- No persistent disk (sessions deleted on every deploy)
- Automatic sleep after 15 minutes of inactivity (kills long downloads)

---

## Recommended Setup: Hetzner CX21 with Docker

**Total cost: €4.51/month ($5) — same performance as a $25 Render plan**

### 1. Get a server

Sign up at [hetzner.com/cloud](https://hetzner.com/cloud):
- Type: **CX21** (2 vCPU, 4 GB RAM, 40 GB SSD)
- OS: **Ubuntu 22.04**
- Location: Choose closest to your users

### 2. Server setup (run once via SSH)

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Install FFmpeg (system-wide)
apt install -y ffmpeg

# Verify
ffmpeg -version
docker --version
```

### 3. Dockerfile

```dockerfile
FROM python:3.11-slim

# Install FFmpeg — critical system dependency
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Sessions directory (mount as volume in production)
RUN mkdir -p /app/sessions

EXPOSE 8000

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2"]
```

### 4. docker-compose.yml

```yaml
version: "3.9"

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - sessions_data:/app/sessions   # Persistent sessions storage
    environment:
      - PYTHONUNBUFFERED=1
      - ENVIRONMENT=production
    restart: unless-stopped
    mem_limit: 3g
    cpus: "2.0"

  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  sessions_data:
    driver: local
```

### 5. nginx.conf (Frontend + API proxy)

```nginx
server {
    listen 80;
    server_name ghostgrab.yourdomain.com;

    # Serve frontend
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to backend
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;   # Allow 5 min for long downloads
        proxy_send_timeout 300s;
        client_max_body_size 10m;
    }
}
```

### 6. Build and deploy

```bash
# On your local machine
npm run build --prefix frontend   # Build React app

# Transfer to server
rsync -avz . root@YOUR_SERVER_IP:/opt/ghostgrab/

# On the server
cd /opt/ghostgrab
docker compose up -d --build

# Check logs
docker compose logs -f backend
```

---

## Environment Variables

Create `.env` in the project root before deploying:

```env
# Production environment flag
ENVIRONMENT=production

# CORS — replace with your actual domain
ALLOWED_ORIGINS=https://ghostgrab.yourdomain.com

# Session TTL in hours (default: 2)
SESSION_TTL_HOURS=2

# Max videos per batch (default: 200)
MAX_BATCH=200
```

---

## Security Hardening for Production

### 1. Restrict CORS to your domain

```python
# backend/main.py
import os
allowed = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=allowed, ...)
```

### 2. Rate limiting (add to requirements.txt)

```
slowapi==0.1.9
```

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/download")
@limiter.limit("5/minute")  # Max 5 download starts per IP per minute
async def start_download(...): ...
```

### 3. Firewall (UFW)

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw deny 8000   # Block direct backend access (nginx proxies it)
ufw enable
```

### 4. SSL/HTTPS with Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ghostgrab.yourdomain.com
```

---

## Scaling Guide

| Users | Setup | Cost |
|---|---|---|
| 1–5 (agency team) | Single Hetzner CX21 | €4.51/mo |
| 5–20 | Hetzner CX31 (2 vCPU, 8 GB) | €9.19/mo |
| 20–50 | CX41 (4 vCPU, 16 GB) + CDN for downloads | €18.30/mo |
| 50+ | Load balancer + 2× CX31 + object storage | ~€40/mo |

> **Note:** GhostGrab is CPU-bound during FFmpeg encoding. Scaling means more CPUs,
> not more RAM. The `--workers 2` in uvicorn allows 2 concurrent jobs on a 2-vCPU server.
> Increase workers to match your vCPU count.

---

## Disk Management Automation

Add a cron job on the server to guarantee disk stays clean:

```bash
crontab -e
# Add:
0 * * * * find /opt/ghostgrab/sessions -type d -mmin +120 -exec rm -rf {} + 2>/dev/null
0 2 * * * docker system prune -f   # Clean Docker cache nightly
```
