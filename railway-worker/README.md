# Railway Alpsabzug Scraper Worker

This is a separate Railway service that handles Playwright-based scraping for Swiss Alpsabzug events. It runs independently from the main Vercel deployment.

## Setup Instructions

### 1. Create New Railway Service

1. Go to your Railway project
2. Click "New Service" → "Empty Service"
3. Name it "alpsabzug-scraper"

### 2. Connect GitHub Repository

1. In the service settings, connect your GitHub repo
2. Set the root directory to `/railway-worker`
3. Railway will auto-detect the Dockerfile

### 3. Configure Environment Variables

Add these variables in Railway:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}  # Reference your existing DB
NOMINATIM_EMAIL=your_email@example.com
PORT=3000
```

### 4. Deploy

Railway will automatically build and deploy the service.

### 5. Get Service URL

After deployment, Railway will provide a URL like:
`https://alpsabzug-scraper.railway.app`

### 6. Configure Vercel

Add this to your Vercel environment variables:
```env
RAILWAY_WORKER_URL=https://alpsabzug-scraper.railway.app
```

## Usage

### Automatic Scraping
The worker automatically scrapes Alpsabzug events:
- On startup
- Daily at 7 AM UTC

### Manual Trigger
From Vercel app:
```bash
POST /api/scrape/alpsabzug
Authorization: Bearer YOUR_SCRAPE_TOKEN
```

Or directly to Railway:
```bash
POST https://alpsabzug-scraper.railway.app/scrape
```

### Health Check
```bash
GET https://alpsabzug-scraper.railway.app/health
```

## Architecture

```
Vercel (Main App)          Railway (Worker)
┌─────────────────┐       ┌──────────────────┐
│                 │       │                  │
│  Next.js App    │       │ Playwright       │
│  - UI           │       │ Scraper          │
│  - API Routes   │──────►│ - Alpsabzug      │
│  - ST Scraper   │       │   events         │
│  - Limmattal    │       │ - Runs daily     │
│                 │       │                  │
└────────┬────────┘       └────────┬─────────┘
         │                         │
         └─────────┬───────────────┘
                   │
           ┌───────▼────────┐
           │                │
           │  PostgreSQL    │
           │  (Railway)     │
           │                │
           └────────────────┘
```

## Monitored Sites

1. **Graubünden Tourism** - graubuenden.ch
2. **Valais Tourism** - valais.ch  
3. **Appenzell Tourism** - appenzell.ch
4. **Uri Tourism** - uri.swiss
5. **Schwyz Tourism** - schwyz-tourismus.ch

## Troubleshooting

### Check Logs
```bash
railway logs -s alpsabzug-scraper
```

### Common Issues

1. **Timeout errors**: Increase timeout in Dockerfile
2. **Memory issues**: Scale up Railway service
3. **Database connection**: Check DATABASE_URL is correct
4. **No events found**: Check selectors match current website structure