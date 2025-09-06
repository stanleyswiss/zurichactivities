# Swiss Activities Dashboard

A Next.js dashboard that aggregates events and activities near Schlieren, ZH from various Swiss sources including official tourism APIs and regional websites.

## Features

- **Multi-source Event Aggregation**: Switzerland Tourism API, Limmattal regional site, and more
- **Smart Deduplication**: Hash-based system to prevent duplicate events
- **Location-based Filtering**: Distance-based event filtering from Schlieren
- **Advanced Search & Filters**: Date range, categories, sources, price filtering
- **Automated Scraping**: Daily scheduled data collection at 6 AM
- **Rate Limiting**: Respects API limits (1 req/s for Switzerland Tourism)
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS

## Tech Stack

- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Prisma** with SQLite (dev) / PostgreSQL (production ready)
- **Tailwind CSS** for styling
- **Cheerio** for HTML scraping
- **node-cron** for scheduled tasks

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Swiss Tourism API key (provided in Claude.md)

### Installation

1. Install dependencies:
```bash
npm install
# or
yarn install
```

2. Set up environment variables:
```bash
cp .env.local.example .env.local
```

3. Set up database:
```bash
npx prisma generate
npx prisma db push
```

4. Run development server:
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## API Endpoints

### `GET /api/events`
Fetch filtered events with query parameters:
- `from`, `to`: Date range (ISO format)
- `lat`, `lon`: Center coordinates (defaults to Schlieren)
- `radius`: Distance in km (default: 100)
- `category`: Filter by category
- `source`: Filter by source (ST, LIMMATTAL, etc.)
- `lang`: Language (de, en)

### `POST /api/scrape`
Manually trigger event scraping:
```json
{
  "sources": ["ST", "LIMMATTAL"],
  "force": true
}
```

### `GET /api/health`
System health check showing database stats and scraper status.

## Event Sources

### Implemented
- **Switzerland Tourism (ST)**: Official Swiss tourism events via API
- **Limmattal (LIMMATTAL)**: Regional events via web scraping

### Planned
- **Zurich Tourism**: Major Zurich city events
- **Municipal**: Local municipality websites (Schlieren, Dietikon, etc.)

## Event Categories

- **Alpsabzug**: Traditional cattle descent events
- **Festival**: General festivals and celebrations
- **Music**: Concerts and music events
- **Market**: Markets and fairs
- **Family**: Family-friendly activities
- **Sports**: Sports events
- **Culture**: Cultural events and theater
- **Community**: Municipal and community events
- **Seasonal**: Christmas markets, seasonal events

## Geographic Coverage

- **Primary (±15km)**: Schlieren, Dietikon, Zurich, Urdorf, Oberengstringen
- **Secondary (±50km)**: Basel, Lucerne, Bern (major events only)
- **Special (±100km)**: Alpsabzug events, major festivals

## Development

### Database Operations
```bash
# Generate Prisma client
npm run db:generate

# Push schema changes
npm run db:push

# Create migration
npm run db:migrate

# Open database studio
npm run db:studio
```

### Scraping
The system automatically scrapes events daily at 6 AM. For manual scraping, use the admin panel in the UI or call the API directly.

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
ST_API_KEY="your_switzerland_tourism_api_key"
NEXT_PUBLIC_SCHLIEREN_LAT="47.396"
NEXT_PUBLIC_SCHLIEREN_LON="8.447"
SCRAPE_INTERVAL_HOURS="24"
```

## Deployment

For production deployment:

1. Update `DATABASE_URL` to PostgreSQL connection string
2. Set up proper environment variables
3. Run database migrations
4. Deploy to your platform of choice (Vercel, Railway, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is intended for educational and non-commercial use.

## Support

For issues and questions, please check the existing documentation or create an issue in the repository.