# IntelPilot

Agentic research system that continuously monitors the web for external signals (new companies, traction indicators, pricing changes, market trends) and produces **evidence-backed weekly intelligence reports**.

---

## Table of Contents

- [Product Goal](#product-goal)
- [MVP Scope](#mvp-scope)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [MongoDB Atlas Vector Search](#mongodb-atlas-vector-search)
- [Running](#running)
- [API Reference](#api-reference)
- [Sources](#sources)
- [Architecture & Data Flow](#architecture--data-flow)
- [Data Model (MongoDB Collections)](#data-model-mongodb-collections)
- [Signal Extraction](#signal-extraction)
- [Entity Deduplication](#entity-deduplication)
- [Report Generation](#report-generation)
- [Cron Schedules](#cron-schedules)
- [Acceptance Criteria](#acceptance-criteria)

---

## Product Goal

Build an agentic research system that continuously monitors the web for user-relevant external signals and produces evidence-backed weekly intelligence reports. This MVP covers **research + report generation** only — no email/notifications.

---

## MVP Scope

### In Scope

- Continuous scanning of **4 sources** (Product Hunt, Hacker News Show HN, RSS feeds, Reddit r/SaaS)
- **Tabstack API** for web browsing + structured data extraction
- **MongoDB Atlas** as primary database for raw + structured artifacts
- **MongoDB Atlas Vector Search** for embeddings + similarity-based entity dedup
- Basic dedup/entity resolution (domain/name match + vector similarity)
- Weekly report generation (HTML + JSON, viewable via endpoint)
- **Cloudflare R2** for optional HTML/markdown snapshots
- Concurrent scanning across sources with batched extractions

### Out of Scope (MVP)

- Email delivery / Slack alerts / push notifications
- User-configurable source UI (sources are hardcoded)
- Full auth/multi-tenant system (single admin token)
- Complex enrichment (funding databases, paid APIs)
- Perfect revenue verification (stores "claims" with evidence)

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ (ES Modules) |
| API | Express.js |
| Database | MongoDB Atlas |
| Vector Search | MongoDB Atlas Vector Search (cosine, 3072 dims) |
| Web Extraction | Tabstack API (`/v1/extract/json`, `/v1/extract/markdown`) |
| Embeddings | OpenAI `text-embedding-3-large` (3072 dimensions) |
| Object Storage | Cloudflare R2 via `@aws-sdk/client-s3` |
| Scheduling | `node-cron` |

### Dependencies

**Runtime:** `express`, `dotenv`, `axios`, `mongodb`, `node-cron`, `@aws-sdk/client-s3`, `cors`, `helmet`, `morgan`

**Dev:** `nodemon`

---

## Project Structure

```
src/
├── index.js                 # Server entry point
├── app.js                   # Express app (middleware, routes, /report page)
├── config/
│   └── index.js             # Centralized environment config
├── db/
│   └── mongo.js             # MongoDB connection, collection helper, indexes
├── lib/
│   ├── tabstack.js          # Tabstack REST client + extraction schemas
│   ├── embeddings.js        # OpenAI embeddings with retry/backoff
│   ├── r2.js                # Cloudflare R2 snapshot storage
│   └── signals.js           # Regex-based signal extraction heuristics
├── sources/
│   ├── index.js             # Source registry
│   ├── producthunt.js       # Product Hunt daily leaderboard
│   ├── hackernews.js        # Hacker News Show HN (Firebase API)
│   ├── rss.js               # TLDR AI + HN Newest feeds
│   └── reddit.js            # Reddit r/SaaS hot posts
├── services/
│   ├── scanner.js           # Concurrent scan orchestration
│   ├── extractor.js         # Tabstack extraction pipeline
│   ├── entities.js          # Entity resolution + vector dedup
│   └── reports.js           # Weekly report generation + scoring
├── routes/
│   ├── index.js             # Route aggregator
│   ├── health.js            # GET /api/health
│   ├── reports.js           # GET /api/reports/*
│   ├── entities.js          # GET /api/entities/*
│   └── admin.js             # POST /api/admin/*
├── middleware/
│   ├── errorHandler.js      # Global error handler
│   └── auth.js              # Admin bearer token auth
└── cron/
    └── index.js             # Cron job setup (scan + report)
```

---

## Setup

```bash
git clone <repo-url>
cd intelpilot
npm install
cp .env.example .env
# Fill in all values in .env (see Environment Variables below)
```

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | No | `development` or `production` (default: `development`) |
| `PORT` | No | Server port (default: `3000`) |
| `ADMIN_TOKEN` | No | Bearer token for admin endpoints (skipped in dev if set to placeholder) |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string |
| `MONGODB_DB` | No | Database name (default: `intelpilot`) |
| `TABSTACK_API_KEY` | **Yes** | Tabstack API key from [console.tabstack.ai](https://console.tabstack.ai) |
| `TABSTACK_BASE_URL` | No | Tabstack API base URL (default: `https://api.tabstack.ai`) |
| `OPENAI_API_KEY` | **Yes** | OpenAI API key for embeddings |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model (default: `text-embedding-3-large`) |
| `OPENAI_EMBEDDING_DIM` | No | Vector dimensions (default: `3072`) |
| `SCAN_CRON` | No | Scan schedule (default: `*/30 * * * *` = every 30 min) |
| `WEEKLY_REPORT_CRON` | No | Report schedule (default: `0 9 * * 1` = Monday 9am) |
| `R2_BUCKET` | No | R2 bucket name |
| `R2_ACCOUNT_ID` | No | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | No | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | R2 secret key |
| `R2_ENDPOINT` | No | R2 S3-compatible endpoint |
| `R2_REGION` | No | R2 region (default: `auto`) |

R2 is optional — if `R2_ENDPOINT` is not set, snapshot uploads are skipped gracefully.

---

## MongoDB Atlas Vector Search

Create a vector search index **before running** (or after collections exist):

1. Atlas dashboard → **Search & Vector Search** → **Create Index**
2. Select **Vector Search** → **JSON Editor**
3. Database: `intelpilot`, Collection: `entities`
4. Index name: `entity_embedding_index`
5. Definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 3072,
      "similarity": "cosine"
    }
  ]
}
```

The app auto-creates all collections and regular indexes on first connect. The vector index must be created manually in Atlas.

---

## Running

```bash
# Development (auto-reload via nodemon)
npm run dev

# Production
npm start
```

The server connects to MongoDB, ensures indexes, starts cron jobs, and listens on the configured port.

---

## API Reference

### Public Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/health` | GET | Health check (server + DB status) |
| `/api/reports/latest` | GET | Latest report as JSON (add `?format=html` for HTML) |
| `/api/reports` | GET | List all reports (metadata only) |
| `/api/entities` | GET | List entities. Query params: `?sort=`, `?order=`, `?limit=`, `?skip=`, `?tag=` |
| `/api/entities/:id` | GET | Entity detail with signals + evidence |
| `/report` | GET | Latest report rendered as a standalone HTML page |

### Admin Endpoints

Require `Authorization: Bearer <ADMIN_TOKEN>` header (skipped in dev if token is placeholder).

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/admin/scan/run` | POST | Trigger a full scan (returns immediately, runs in background) |
| `/api/admin/report/generate` | POST | Generate a weekly report now |

---

## Sources

| # | Source | Method | What it extracts |
| --- | --- | --- | --- |
| 1 | **Product Hunt** | Tabstack JSON extraction on daily leaderboard | Product names, taglines, upvotes, websites, topics |
| 2 | **Hacker News Show HN** | HN Firebase API (top 20 stories) | Titles, URLs, points, authors, comment counts |
| 3 | **RSS Feeds** | Tabstack JSON extraction (TLDR AI, HN Newest) | Article titles, URLs, summaries, authors, dates, tags |
| 4 | **Reddit r/SaaS** | Tabstack JSON extraction on hot posts | Titles, URLs, upvotes, comments, flairs, snippets |

Sources run **concurrently** during scans. Within each source, extractions run in batches of 3.

---

## Architecture & Data Flow

```
┌─────────────┐
│ Cron / API  │  (every 30min or POST /admin/scan/run)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│           Scanner (concurrent)          │
│  Product Hunt │ HN │ RSS │ Reddit       │
└──────┬────────┴──┬─┴───┬─┴───┬──────────┘
       │           │     │     │
       ▼           ▼     ▼     ▼
┌─────────────────────────────────────────┐
│        Candidate URLs discovered        │
│          (deduplicated by URL)          │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│       Extractor (per candidate URL)     │
│                                         │
│  1. Tabstack /extract/json (structured) │
│  2. Tabstack /extract/markdown (text)   │
│  3. Upload snapshot to R2 (optional)    │
│  4. Store raw_page + evidence           │
│  5. Resolve entity (dedup)              │
│  6. Extract signals (regex heuristics)  │
│  7. Store signals linked to entity      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│        Entity Resolution (dedup)        │
│                                         │
│  1. Exact domain match                  │
│  2. Case-insensitive name match         │
│  3. Atlas Vector Search (cosine ≥ 0.85) │
│  4. Create new entity if no match       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│      Report Generation (weekly cron)    │
│                                         │
│  1. Pull entities updated this week     │
│  2. Score by signal weights + recency   │
│  3. Rank top 30 entities                │
│  4. Generate HTML + JSON report         │
│  5. Store in reports collection         │
└─────────────────────────────────────────┘
```

---

## Data Model (MongoDB Collections)

### `sources`
| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Unique source name |
| `type` | string | `html` or `rss` |
| `config` | object | Source-specific config |
| `enabled` | boolean | Whether source is active |

### `scan_runs`
| Field | Type | Description |
| --- | --- | --- |
| `source_id` | ObjectId | Reference to source |
| `started_at` | Date | Scan start time |
| `finished_at` | Date | Scan end time |
| `status` | string | `running`, `success`, `fail` |
| `counts` | object | `{ candidates_found, extracted_success, extracted_fail }` |

### `discoveries`
| Field | Type | Description |
| --- | --- | --- |
| `source_id` | ObjectId | Source that found this |
| `candidate_url` | string | Discovered URL |
| `title` | string | Page/post title |
| `meta` | object | Source-specific metadata |
| `discovered_at` | Date | When discovered |
| `status` | string | `queued`, `extracted`, `failed` |
| `entity_id` | ObjectId | Resolved entity (nullable) |
| `extraction_ref` | ObjectId | Reference to raw_page |

### `raw_pages`
| Field | Type | Description |
| --- | --- | --- |
| `url` | string | Page URL |
| `fetched_at` | Date | When fetched |
| `source_id` | ObjectId | Source reference |
| `extracted_text` | string | Markdown content |
| `r2_snapshot_key` | string | R2 object key (nullable) |
| `tabstack_payload` | object | Raw Tabstack JSON response |

### `entities`
| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Company/product name |
| `canonical_domain` | string | Primary domain (nullable) |
| `description` | string | Short description |
| `tags` | string[] | Category tags |
| `identifiers` | object | `{ github, twitter, producthunt, hackernews }` |
| `created_at` | Date | Creation time |
| `updated_at` | Date | Last update time |
| `embedding` | number[] | 3072-dim vector (nullable) |
| `embedding_model` | string | `text-embedding-3-large` |
| `embedding_version` | string | `v1` |

### `evidence`
| Field | Type | Description |
| --- | --- | --- |
| `url` | string | Source page URL |
| `type` | string | `page`, `post`, or `pricing` |
| `snippet` | string | Supporting text excerpt |
| `captured_at` | Date | When captured |
| `raw_page_id` | ObjectId | Reference to raw_page |
| `r2_snapshot_key` | string | R2 object key (nullable) |

### `signals`
| Field | Type | Description |
| --- | --- | --- |
| `entity_id` | ObjectId | Entity this signal belongs to |
| `signal_type` | string | See Signal Types below |
| `value_text` | string | Matched text |
| `value_num` | number | Parsed numeric value (nullable) |
| `unit` | string | `MRR`, `ARR`, `revenue`, `users`, etc. (nullable) |
| `confidence` | number | 0–1 heuristic confidence |
| `evidence_id` | ObjectId | Supporting evidence record |
| `source_id` | ObjectId | Source that produced this |
| `captured_at` | Date | When captured |

### `reports`
| Field | Type | Description |
| --- | --- | --- |
| `period_start` | Date | Report period start |
| `period_end` | Date | Report period end |
| `generated_at` | Date | When generated |
| `items` | array | Scored entity summaries with signals + evidence |
| `report_json` | object | Structured report data |
| `report_html` | string | Rendered HTML report |
| `stats` | object | `{ entities_in_report, total_entities_updated, scans_completed, scans_failed }` |

---

## Signal Extraction

Signals are extracted from page content using regex heuristics:

| Signal Type | What it detects | Example matches | Confidence |
| --- | --- | --- | --- |
| `revenue_claim` | MRR/ARR/revenue mentions | `$50k MRR`, `revenue of $1.2M` | 0.75–0.85 |
| `customer_count_claim` | User/customer count claims | `500 customers`, `10k users` | 0.75–0.80 |
| `pricing_present` | Pricing information | `$29/mo`, `Enterprise plan`, `Free tier` | 0.70–0.90 |
| `launch_announcement` | New product launches | `just launched`, `Show HN:`, `now available` | 0.80–0.90 |
| `trend_indicator` | Topic/category tags from content | Tags inferred by Tabstack | 0.60 |

Each signal includes `value_text`, optional `value_num`/`unit`, `confidence`, and a reference to the evidence record.

---

## Entity Deduplication

Three-tier dedup strategy (checked in order):

1. **Deterministic — Domain match:** exact match on `canonical_domain`
2. **Deterministic — Name match:** case-insensitive exact match on `name`
3. **Vector similarity — Atlas Vector Search:**
   - Embed `"Name: X | Domain: Y | Description: Z | Tags: ..."` via OpenAI
   - Query top-3 nearest entities using `$vectorSearch` (cosine similarity)
   - **≥ 0.85:** auto-merge into existing entity
   - **≥ 0.70:** log as possible duplicate (no auto-merge)
   - **< 0.70:** create new entity

Embeddings use retry with exponential backoff (up to 5 retries) to handle OpenAI rate limits.

---

## Report Generation

Weekly reports are generated on schedule (`0 9 * * 1` = Monday 9am) or on demand via `POST /api/admin/report/generate`.

### Scoring formula

Each entity is scored by:

| Factor | Weight |
| --- | --- |
| `revenue_claim` signal | ×10 |
| `customer_count_claim` signal | ×8 |
| `pricing_present` signal | ×7 |
| `launch_announcement` signal | ×5 |
| `trend_indicator` signal | ×2 |
| Multi-source mentions | +3 per unique source |
| Recency bonus | +0 to +7 (days since update) |

All signal scores are multiplied by their confidence. Top 30 entities by score are included.

### Report item format

Each report entry includes:
- Entity name + domain
- Short description
- Key signals (bulleted with confidence %)
- Evidence links (up to 3 per entity)
- Source count + average confidence

Reports are stored as both `report_json` (structured) and `report_html` (styled, self-contained HTML page).

---

## Cron Schedules

| Job | Default Schedule | Env Variable |
| --- | --- | --- |
| Source scanning | Every 30 minutes | `SCAN_CRON` |
| Weekly report | Monday 9:00 AM | `WEEKLY_REPORT_CRON` |

---

## Acceptance Criteria

- [x] Scans at least 3 sources on a schedule
- [x] Uses Tabstack to extract structured content for each discovery
- [x] Stores discoveries/signals/evidence in MongoDB Atlas
- [x] Uses Atlas Vector Search for top-k similar entity dedup
- [x] Generates weekly reports with entity rankings
- [x] Each report entry contains at least one evidence link + snippet
- [x] Latest report viewable via `/report` endpoint
- [x] Concurrent scanning across sources
- [x] Retry with backoff for OpenAI rate limits
