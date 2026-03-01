# IntelPilot

Agentic research system that continuously monitors the web for **AI startup signals** — new companies, traction indicators, funding, team size, user counts — and produces **evidence-backed weekly intelligence reports** enriched with deep-web research.

---

## Table of Contents

- [Product Goal](#product-goal)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [MongoDB Atlas Vector Search](#mongodb-atlas-vector-search)
- [Running](#running)
- [API Reference](#api-reference)
- [Sources](#sources)
- [Pipeline Architecture](#pipeline-architecture)
- [LLM Classification](#llm-classification)
- [Research Enrichment](#research-enrichment)
- [Data Model (MongoDB Collections)](#data-model-mongodb-collections)
- [Signal Extraction](#signal-extraction)
- [Entity Deduplication](#entity-deduplication)
- [Report Generation](#report-generation)
- [Cron Schedules](#cron-schedules)

---

## Product Goal

Build an agentic research system that continuously monitors the web for new **AI startups and products**, classifies them using LLMs, enriches them with deep-web research, and produces ranked weekly intelligence reports with verified data and website URLs.

This MVP covers **discovery + classification + enrichment + report generation**. No email/notifications.

---

## How It Works

1. **Scan** — Fetches candidates from 14 source channels (Product Hunt, Hacker News top 40, 4 RSS/web feeds, 10 Reddit subreddits, BetaList)
2. **Extract** — Uses Tabstack API to pull structured data from each candidate URL (including explicit product website URL detection)
3. **Classify** — OpenAI `gpt-4o-mini` classifies each entity: is it an AI startup with an identifiable product name?
4. **Deduplicate** — Three-tier entity resolution (domain match → name match → vector similarity via Atlas Vector Search)
5. **Enrich** — All report entities are researched via Tabstack `/research` endpoint, then metrics are extracted with GPT (with name-matching validation and dead domain detection)
6. **Verify** — Entities enriched but with no web presence are heavily penalized; parked/dead domains are auto-delisted
7. **Report** — Scored and ranked into an HTML + JSON report (up to 50 entries) with website URLs, revenue, funding, users, and team size

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ (ES Modules) |
| API | Express.js |
| Database | MongoDB Atlas |
| Vector Search | MongoDB Atlas Vector Search (cosine, 3072 dims) |
| Web Extraction | Tabstack API (`/v1/extract/json`, `/v1/extract/markdown`, `/v1/research`) |
| Embeddings | OpenAI `text-embedding-3-large` (3072 dimensions) |
| LLM Classification | OpenAI `gpt-4o-mini` (entity classification + metric extraction) |
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
│   ├── tabstack.js          # Tabstack client (extract JSON, markdown, research SSE)
│   ├── openai.js            # OpenAI chat completions client (classify + extract)
│   ├── embeddings.js        # OpenAI embeddings with retry/backoff
│   ├── r2.js                # Cloudflare R2 snapshot storage
│   └── signals.js           # Regex-based signal extraction heuristics
├── sources/
│   ├── index.js             # Source registry
│   ├── producthunt.js       # Product Hunt daily leaderboard
│   ├── hackernews.js        # Hacker News Show HN (top 40, Firebase API)
│   ├── rss.js               # TLDR AI, HN Newest, HN Front Page, There's An AI For That
│   ├── reddit.js            # 10 subreddits (SaaS, startups, indiehackers, artificial, LocalLLaMA, machinelearning, ChatGPT, singularity, OpenAI, AItools)
│   └── betalist.js          # BetaList new startups (via Tabstack extract)
├── services/
│   ├── scanner.js           # Concurrent scan orchestration
│   ├── extractor.js         # Tabstack extraction + product URL resolution + classifier integration
│   ├── classifier.js        # LLM startup classification (gpt-4o-mini)
│   ├── enricher.js          # Tabstack /research enrichment + name validation + dead domain detection
│   ├── entities.js          # Entity resolution + vector dedup
│   └── reports.js           # Report generation, scoring, URL verification, HTML rendering
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
| `OPENAI_API_KEY` | **Yes** | OpenAI API key (used for embeddings + gpt-4o-mini classification/extraction) |
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
| `/api/reports/latest` | GET | Latest report (HTML in browser, JSON for API clients) |
| `/api/reports` | GET | List all reports (metadata only) |
| `/api/entities` | GET | List entities. Query: `?sort=`, `?order=`, `?limit=`, `?skip=`, `?tag=` |
| `/api/entities/:id` | GET | Entity detail with signals + evidence |
| `/report` | GET | Latest report rendered as a standalone HTML page |

### Admin Endpoints

Require `Authorization: Bearer <ADMIN_TOKEN>` header (skipped in dev if token is placeholder).

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/admin/scan/run` | POST | Trigger a full scan (returns immediately, runs in background) |
| `/api/admin/report/generate` | POST | Generate a report now (enriches all unenriched entities in background) |
| `/api/admin/enrich` | POST | Manually trigger enrichment. Query: `?limit=15` |

---

## Sources

| # | Source | Method | Candidates | What it finds |
| --- | --- | --- | --- | --- |
| 1 | **Product Hunt** | Tabstack JSON extraction on daily leaderboard | ~20 | Product names, taglines, upvotes, websites, topics |
| 2 | **Hacker News Show HN** | HN Firebase API (top 40 stories) | 40 | Titles, URLs, points, authors, comment counts |
| 3 | **RSS / Web Feeds** | Tabstack JSON extraction | ~60 | TLDR AI, HN Newest, HN Front Page, There's An AI For That |
| 4 | **Reddit** (10 subreddits) | Reddit JSON API | ~360 | r/SaaS (50), r/startups (50), r/indiehackers (50), r/artificial (40), r/LocalLLaMA (40), r/machinelearning (30), r/ChatGPT (30), r/singularity (20), r/OpenAI (20), r/AItools (30) |
| 5 | **BetaList** | Tabstack JSON extraction on betalist.com/startups | ~20 | Startup names, taglines, tags, URLs |

All sources run concurrently during scans. Reddit fetches from all 10 subreddits in parallel using the public JSON API. Reddit self-posts are processed directly from their content without Tabstack to avoid Reddit bot detection.

---

## Pipeline Architecture

```
Sources (~500 candidates per scan)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Scanner (concurrent across all sources)                     │
│  Product Hunt │ HN (40) │ RSS (4 feeds) │ 10x Reddit │ Beta │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Extractor (batched, 5 concurrent)                           │
│                                                              │
│  1. Tabstack /extract/json (structured data + product URL)   │
│  2. Tabstack /extract/markdown (full text)                   │
│  3. Resolve product website (from relevant_links, domain)    │
│  4. Upload snapshot to R2 (optional)                         │
│  5. Store raw_page + evidence                                │
│  6. Resolve entity (3-tier dedup)                            │
│  7. Extract signals (regex heuristics)                       │
│  8. LLM Classification (gpt-4o-mini)                         │
│     → is_startup, clean_name, category, one_liner            │
│     → website_url (aggregator URLs rejected)                 │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Report Generation                                           │
│                                                              │
│  1. Filter: classification.is_startup = true                 │
│     AND classification.clean_name != null                    │
│  2. Score by signal weights + recency                        │
│  3. Research Enrichment (all unenriched entities, background)│
│     → Tabstack /research SSE endpoint                        │
│     → GPT extracts: revenue, funding, users, team size,      │
│       website URL, growth, founded year, domain status       │
│     → Name-match validation (Levenshtein ≥ 0.7)             │
│     → Dead/parked domain auto-delist                         │
│  4. Verification penalty (no web presence → score × 0.1)     │
│  5. Rank top 50, build HTML + JSON report                    │
└──────────────────────────────────────────────────────────────┘
```

---

## LLM Classification

Every entity is classified by OpenAI `gpt-4o-mini` after extraction. The classifier determines:

| Field | Description |
| --- | --- |
| `is_startup` | `true` only for AI/ML startups and products with identifiable names |
| `confidence` | 0–1 classification confidence |
| `clean_name` | Actual product name (1-4 words, not a Reddit title or headline) |
| `one_liner` | Concise description of what the product does |
| `category` | AI sub-category (e.g. AI Agent, LLM Tool, AI SaaS, AI Healthcare) |
| `website_url` | Product's own website URL (aggregator URLs like PH/HN/Reddit are rejected) |

**Filtered out:** non-AI startups, news articles, opinion pieces, questions, big tech (Google, OpenAI, etc.), portfolio sites, agencies, consulting firms, unnamed projects.

**Name validation:** names longer than 40 characters or more than 5 words are rejected (entity marked as not a startup).

**URL validation:** returned URLs are checked against a blocklist of 24+ aggregator domains. Aggregator URLs are rejected and set to `null`.

Cost: ~$0.001 per classification with gpt-4o-mini.

---

## Research Enrichment

All classified AI startups are enriched via Tabstack's `/research` SSE endpoint for deeper, verified data.

**Pipeline:**
1. Tabstack `/research` searches the web for the startup (asking specifically for website URL, revenue, funding, team size, users, growth)
2. The research report (streamed via SSE) is fed to `gpt-4o-mini` to extract structured metrics plus `matched_name` and `domain_status`
3. **Name validation:** the `matched_name` from the research is compared to the entity name (substring match or Levenshtein ratio ≥ 0.7). If they don't match, the description, website, and signals are **not** overwritten (prevents contamination from similarly-named companies)
4. **Domain status:** if the research indicates the domain is `parked`, `for_sale`, or `dead`, the entity is automatically marked as not a startup and excluded from future reports
5. A `web_verified` flag is set — if research found real data (and names matched), the entity is verified; otherwise it's unverified
6. Extracted data is stored on the entity and new signals are created (only if name matched)

**Verification penalty:** entities that were enriched but have no web presence (no website URL, no real domain, and research found nothing) get their score reduced to 10%.

**URL handling:** enricher can override a bad `website_url` (aggregator URL) with a proper one found during research, but won't replace a good URL.

**Enrichment runs:**
- Automatically (background) when a report is generated — all unenriched entities
- Manually via `POST /api/admin/enrich?limit=N`

Cost: ~1 Tabstack credit per `/research` call.

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
| `meta` | object | Source-specific metadata (subreddit, upvotes, snippet, etc.) |
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
| `name` | string | Company/product name (cleaned by LLM classifier) |
| `canonical_domain` | string | Primary domain (nullable) |
| `description` | string | Short description (set by classifier or enricher, only if name matched) |
| `tags` | string[] | Category tags |
| `identifiers` | object | `{ github, twitter, producthunt, hackernews, reddit }` |
| `website_url` | string | Actual product website URL, aggregator URLs excluded (nullable) |
| `classification` | object | LLM classification: `{ is_startup, confidence, clean_name, one_liner, category, website_url, classified_at }` |
| `enrichment` | object | Research enrichment: `{ research_text, metrics, name_matched, web_verified, domain_status, enriched_at }` |
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
| `enriched` | boolean | `true` if signal came from research enrichment |

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

Signals are extracted from page content using regex heuristics, then enriched via Tabstack research + GPT:

| Signal Type | What it detects | Example matches | Weight |
| --- | --- | --- | --- |
| `revenue_claim` | MRR/ARR/revenue mentions | `$50k MRR`, `revenue of $1.2M` | 25 |
| `funding_raised` | Funding rounds, investors | `raised $2M seed`, `YC W24`, `bootstrapped` | 20 |
| `growth_rate` | Growth metrics | `grew 30% MoM`, `doubled in 3 months` | 15 |
| `customer_count_claim` | Customer/user counts | `500 customers`, `10k users` | 10 |
| `user_count` | DAU/MAU/downloads/signups | `50K DAU`, `1M downloads`, `waitlist of 5K` | 10 |
| `pricing_present` | Pricing information | `$29/mo`, `Enterprise plan`, `Free tier` | 7 |
| `team_size` | Team/employee count | `solo founder`, `team of 5`, `50 employees` | 5 |
| `launch_announcement` | New product launches | `just launched`, `Show HN:`, `now available` | 4 |
| `trend_indicator` | Topic/category tags | Tags inferred by Tabstack | 1 |

Revenue-bearing entities receive a +100 score bonus and are always sorted first.

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

Reddit self-posts use pseudo-domains (e.g. `reddit-postId`) to ensure each post is treated as a distinct entity.

---

## Report Generation

Reports are generated on schedule (`0 9 * * 1` = Monday 9am) or on demand via `POST /api/admin/report/generate`.

### Report item fields

Each report entry includes:
- Entity name (clickable link to product website)
- AI category badge
- Website URL (verified against aggregator blocklist; falls back to evidence URLs)
- Metric badges: Revenue, Funding, Users, Growth, Team Size
- Notable facts (YC batch, awards, notable customers)
- Short description
- Tags
- Collapsible Signals and Evidence sections
- Source count + average confidence

### Scoring formula

| Factor | Effect |
| --- | --- |
| Signal weights | Each signal × confidence × weight (see table above) |
| Revenue bonus | +100 if any `revenue_claim` signal exists |
| Multi-source mentions | +3 per unique source |
| Recency | +0 to +7 based on days since last update |
| Verification penalty | ×0.1 if enriched but no web presence found |

Top 50 entities by score are included. Reports are stored as both `report_json` (structured) and `report_html` (styled, self-contained HTML page).

### Website URL resolution (report-level)

The report resolves each entity's website through a priority chain, skipping any aggregator URLs:
1. `entity.website_url` (set by extractor or classifier)
2. `enrichment.metrics.website` (found during research)
3. `entity.canonical_domain` (if not a pseudo-domain)
4. Evidence URLs (first non-aggregator URL)

---

## Cron Schedules

| Job | Default Schedule | Env Variable |
| --- | --- | --- |
| Source scanning | Every 30 minutes | `SCAN_CRON` |
| Weekly report | Monday 9:00 AM | `WEEKLY_REPORT_CRON` |
