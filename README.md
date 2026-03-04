# IntelPilot

Agentic research system that continuously monitors the web for **AI startup signals** — new companies, traction indicators, funding, team size, user counts — and produces **evidence-backed intelligence reports** of newly discovered startups, enriched with deep-web research.

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
- [Frontend Dashboard](#frontend-dashboard)
- [Deployment (Railway)](#deployment-railway)

---

## Product Goal

Build an agentic research system that continuously monitors the web for new **AI startups and products**, classifies them using LLMs, enriches them with deep-web research, and produces intelligence reports of newly discovered startups with verified data and website URLs.

This MVP covers **discovery + classification + enrichment + report generation**. A single "Scan" action runs the full pipeline automatically. No email/notifications.

---

## How It Works

1. **Scan** — Fetches candidates from 8 sources / ~20 channels (Product Hunt, Hacker News top 40, 4 RSS/web feeds, 10 Reddit subreddits, BetaList, FutureTools, TechCrunch, AI Tools Directory) with a 10-minute per-source timeout
2. **Extract** — Uses Tabstack API to pull structured data from each candidate URL (including explicit product website URL detection)
3. **Classify** — OpenAI `gpt-4o-mini` classifies each entity: is it an AI startup with an identifiable product name?
4. **Deduplicate** — Three-tier entity resolution (domain match → name match → vector similarity via Atlas Vector Search)
5. **Enrich** — Unenriched entities are automatically researched via Tabstack `/research` endpoint, then metrics are extracted with GPT (with name-matching validation and dead domain detection)
6. **Verify** — Entities enriched but with no web presence are heavily penalized; parked/dead domains are auto-delisted
7. **Report** — Automatically generated after enrichment; shows only **newly discovered startups since the last report**, sorted chronologically (newest first), with source badges and discovery timestamps

The entire pipeline (steps 1–7) runs as a single automated flow — triggered by the "Scan" button or the daily cron job.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ (ES Modules) |
| API | Express.js |
| Database | MongoDB Atlas (Flex) |
| Vector Search | MongoDB Atlas Vector Search (cosine, 3072 dims) |
| Web Extraction | Tabstack API (`/v1/extract/json`, `/v1/extract/markdown`, `/v1/research`) |
| Embeddings | OpenAI `text-embedding-3-large` (3072 dimensions) |
| LLM Classification | OpenAI `gpt-4o-mini` (entity classification + metric extraction) |
| Object Storage | Cloudflare R2 via `@aws-sdk/client-s3` |
| Scheduling | `node-cron` |
| Frontend | Embedded static HTML/CSS/JS dashboard (no build step) |
| Hosting | Railway (auto-deploy from GitHub) |

### Dependencies

**Runtime:** `express`, `dotenv`, `axios`, `mongodb`, `node-cron`, `@aws-sdk/client-s3`, `cors`, `helmet`, `morgan`, `compression`

**Dev:** `nodemon`

---

## Project Structure

```
src/
├── index.js                 # Server entry point
├── app.js                   # Express app (middleware, static files, routes, /report page)
├── public/
│   ├── index.html           # Dashboard UI (scan, entity grid, report modal, pipeline progress)
│   ├── style.css            # Dashboard styles (dark theme, cards, modals, responsive)
│   └── app.js               # Frontend logic (API calls, pipeline polling, entity grid, report modal)
├── config/
│   └── index.js             # Centralized environment config
├── db/
│   └── mongo.js             # MongoDB connection, collection helper, indexes
├── lib/
│   ├── tabstack.js          # Tabstack client (extract JSON, markdown, research SSE)
│   ├── openai.js            # OpenAI chat completions client (classify + extract)
│   ├── embeddings.js        # OpenAI embeddings with retry/backoff
│   ├── r2.js                # Cloudflare R2 snapshot storage
│   ├── signals.js           # Regex-based signal extraction heuristics
│   └── namefix.js           # Entity name correction (generic → enrichment matched_name)
├── sources/
│   ├── index.js             # Source registry
│   ├── producthunt.js       # Product Hunt daily leaderboard
│   ├── hackernews.js        # Hacker News Show HN (top 40, Firebase API)
│   ├── rss.js               # TLDR AI, HN Newest, HN Front Page, There's An AI For That
│   ├── reddit.js            # 10 subreddits (SaaS, startups, indiehackers, artificial, LocalLLaMA, machinelearning, ChatGPT, singularity, OpenAI, AItools)
│   ├── betalist.js          # BetaList new startups (via Tabstack extract)
│   ├── futuretools.js       # FutureTools AI directory (via Tabstack extract)
│   ├── techcrunch.js        # TechCrunch AI/startup articles (via Tabstack extract)
│   └── aitoolsdirectory.js  # AI Tools Directory listings (via Tabstack extract)
├── services/
│   ├── scanner.js           # Concurrent scan orchestration (10-min per-source timeout) + auto-enrich + URL/name fix + auto-report
│   ├── extractor.js         # Tabstack extraction + product URL resolution + classifier integration
│   ├── classifier.js        # LLM startup classification (gpt-4o-mini)
│   ├── enricher.js          # Tabstack /research enrichment + name validation + bad URL override + dead domain detection
│   ├── entities.js          # Entity resolution + vector dedup
│   ├── reports.js           # New-discoveries report generation, URL verification, dark-theme HTML
│   └── progress.js          # In-memory job progress tracking for dashboard polling
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
    └── index.js             # Daily scan cron (full pipeline: scan → enrich → report)
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
| `SCAN_CRON` | No | Daily scan schedule (default: `0 8 * * *` = every day at 8:00 AM UTC) |
| `R2_BUCKET` | No | R2 bucket name |
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
| `/` | GET | Dashboard UI (scan pipeline, entity grid, report viewer) |
| `/api/health` | GET | Health check (server + DB status) |
| `/api/reports/latest` | GET | Latest report metadata (add `?full=true` for full HTML+JSON) |
| `/api/reports` | GET | List all reports (metadata only) |
| `/api/entities` | GET | List entities. Query: `?sort=`, `?order=`, `?limit=`, `?skip=`, `?tag=` |
| `/api/entities/:id` | GET | Entity detail with signals + evidence |
| `/report` | GET | Latest report rendered as a standalone HTML page |
| `/report/:id` | GET | Specific report by ID rendered as HTML |
| `/api/admin/scan/status` | GET | Live scan progress (running state, counts, recent runs) |
| `/api/admin/jobs` | GET | Live progress for all operations (scan, report, enrich) |

### Admin Endpoints

Require `Authorization: Bearer <ADMIN_TOKEN>` header (skipped in dev if token is placeholder).

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/admin/scan/run` | POST | Trigger full pipeline: scan → enrich → URL/name fix → report (returns immediately, runs in background) |
| `/api/admin/report/generate` | POST | Generate a report manually (awaits enrichment, then builds HTML) |
| `/api/admin/enrich` | POST | Manually trigger enrichment. Query: `?limit=15` |
| `/api/admin/fix-urls` | POST | Bulk-sync entity `website_url` from enrichment data + fix generic/wrong entity names |

---

## Sources

| # | Source | Method | Candidates | What it finds |
| --- | --- | --- | --- | --- |
| 1 | **Product Hunt** | Tabstack JSON extraction on daily leaderboard | ~20 | Product names, taglines, upvotes, websites, topics |
| 2 | **Hacker News Show HN** | HN Firebase API (top 40 stories) | 40 | Titles, URLs, points, authors, comment counts |
| 3 | **RSS / Web Feeds** | Tabstack JSON extraction | ~60 | TLDR AI, HN Newest, HN Front Page, There's An AI For That |
| 4 | **Reddit** (10 subreddits) | Reddit JSON API | ~360 | r/SaaS (50), r/startups (50), r/indiehackers (50), r/artificial (40), r/LocalLLaMA (40), r/machinelearning (30), r/ChatGPT (30), r/singularity (20), r/OpenAI (20), r/AItools (30) |
| 5 | **BetaList** | Tabstack JSON extraction on betalist.com/startups | ~20 | Startup names, taglines, tags, URLs |
| 6 | **FutureTools** | Tabstack JSON extraction on futuretools.io | ~80 | AI tool names, descriptions, categories, URLs |
| 7 | **TechCrunch** | Tabstack JSON extraction on AI/startup articles | ~40 | Startup names, funding, descriptions |
| 8 | **AI Tools Directory** | Tabstack JSON extraction on aitoolsdirectory.com | ~20 | AI tool listings, descriptions, URLs |

All 8 sources run concurrently during scans with a **10-minute per-source timeout** — if any source hangs, the pipeline proceeds without it. Reddit fetches from all 10 subreddits in parallel using the public JSON API. Reddit self-posts are processed directly from their content without Tabstack to avoid Reddit bot detection.

---

## Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: SCAN (10-min per-source timeout)                    │
│  8 sources (~600 candidates per scan, all concurrent)        │
│  PH │ HN │ RSS │ 10x Reddit │ BetaList │ FT │ TC │ AITD      │
│                                                              │
│  Extractor (batched, 10 concurrent):                         │
│  1. Tabstack /extract/json (structured data + product URL)   │
│  2. Tabstack /extract/markdown (full text)                   │
│  3. Resolve product website (from relevant_links, domain)    │
│  4. Upload snapshot to R2 (optional)                         │
│  5. Store raw_page + evidence                                │
│  6. Resolve entity (3-tier dedup)                            │
│     → Merge protects existing website_url and description    │
│  7. Extract signals (regex heuristics)                       │
│  8. LLM Classification (gpt-4o-mini)                         │
│     → is_startup, clean_name, category, one_liner            │
│     → website_url (validated by isValidProductUrl)           │
└───────────────────────────┬──────────────────────────────────┘
                            │ automatic
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 2: ENRICH                                              │
│  Auto-enriches up to 30 unenriched startup entities          │
│                                                              │
│  1. Tabstack /research SSE endpoint                          │
│  2. GPT extracts: revenue, funding, users, team size,        │
│     website URL, growth, founded year, domain status         │
│  3. Name-match validation (Levenshtein ≥ 0.7)                │
│  4. Research URL always preferred over extraction URL        │
│  5. Dead/parked domain auto-delist                           │
│  6. Override bad website_url even if name match fails        │
│  7. Fix generic entity names using betterName() heuristic    │
│     (e.g. "AI Video Editor" → "Visla" from matched_name)     │
└───────────────────────────┬──────────────────────────────────┘
                            │ automatic
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 2.5: URL + NAME FIX                                    │
│  1. Sync website_url from enrichment for entities with       │
│     missing or invalid URLs                                  │
│  2. Fix generic/wrong entity names using betterName():       │
│     - Generic prefixes (AI/An AI/The), >30 chars, ≤2 chars   │
│     - Names that don't match the entity's domain while       │
│       the enrichment matched_name does                       │
└───────────────────────────┬──────────────────────────────────┘
                            │ automatic
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: REPORT                                              │
│  Auto-generates a "New Discoveries" report                   │
│                                                              │
│  1. Cutoff = last report's generated_at (or 7 days ago)      │
│  2. Filter entities created after cutoff (is_startup = true) │
│  3. Sort chronologically (newest first), no cap              │
│  4. Include source badges + discovery timestamps             │
│  5. Build dark-themed HTML + JSON report                     │
└──────────────────────────────────────────────────────────────┘
```

The entire pipeline runs as a single automated flow — triggered by the dashboard "Scan" button or the daily cron job. The frontend shows a 3-step progress tracker (Scanning → Enriching → Generating report) with live status updates.

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

**Filtered out:** non-AI startups, news articles, opinion pieces, questions, publicly traded mega-corporations (Google, Microsoft, Meta, Amazon, Apple, etc.), portfolio sites, agencies, consulting firms, unnamed projects. Private AI companies of any size (Cursor, Perplexity, Anthropic, OpenAI, Midjourney, etc.) are kept.

**Name validation:** names longer than 40 characters or more than 5 words are rejected (entity marked as not a startup).

**URL validation:** returned URLs are validated by `isValidProductUrl()` which rejects aggregator domains (24+ blocklist), pseudo-domains (`reddit-*`), URLs without a dot in the hostname, and path-only strings. Invalid URLs are set to `null`. The classifier only overrides an existing `website_url` if the current one fails validation.

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

**URL handling:** when enrichment finds a website URL and the name matches, it **always updates** the entity's `website_url`. Even when the name doesn't match, if the current `website_url` is invalid (e.g. an RFC link, aggregator URL, or missing), the enriched URL still overrides it. Research performs a thorough web search and is more reliable than the initial single-page extraction, which can pick up a plausible-looking but incorrect domain. Entity merges during re-scans **do not overwrite** an existing `website_url` or enriched `description` — only enrichment can update these fields.

**Name correction:** the enricher and post-scan pipeline use `betterName()` (from `src/lib/namefix.js`) to replace generic or incorrect entity names with the `matched_name` from enrichment research. Names are corrected when: they start with generic prefixes ("AI ", "An AI ", "The "), are too long (>30 chars) or too short (≤2 chars), or don't match the entity's domain while the enrichment name does. Examples: "AI Video Editor" → "Visla", "p0" → "Purple", "WhatsApp CRM" → "WATI".

**Post-scan URL + name fix pass:** after enrichment, the pipeline scans all enriched entities and:
1. Syncs `website_url` from `enrichment.metrics.website` for any entities with missing or invalid URLs
2. Corrects generic/wrong entity names using the `betterName()` heuristic

**Enrichment runs:**
- Automatically after each scan — up to 30 unenriched entities are enriched before report generation
- During report generation — any remaining unenriched entities in the report set are enriched before the report is built
- Manually via `POST /api/admin/enrich?limit=N`
- Bulk URL + name fix via `POST /api/admin/fix-urls`

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
| `counts` | object | `{ candidates_found, new_candidates, extracted_success, extracted_fail }` |

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

Revenue-bearing entities are prioritized in the dashboard grid view (sorted first with "Revenue First" default sort).

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

Reports are auto-generated after each scan pipeline completes (scan → enrich → report). They can also be triggered manually via `POST /api/admin/report/generate`.

### New Discoveries Report

Each report shows only **startups discovered since the last report was generated** (or the last 7 days if no prior report exists). There is no entry cap — all new startups are included.

### Report item fields

Each report entry includes:
- Entity name (clickable link to product website)
- AI category badge
- **Source badges** (Reddit, Product Hunt, Hacker News, BetaList, etc.)
- Website URL (verified against aggregator blocklist; falls back to evidence URLs)
- Metric badges: Revenue, Funding, Users, Growth, Team Size
- Notable facts (YC batch, awards, notable customers)
- Short description
- Tags
- Collapsible Signals and Evidence sections
- **Discovery timestamp** (when first found)

### Ordering

Entries are sorted **chronologically (newest first)** — no scoring or ranking. This gives a clear "what's new" view.

### Website URL resolution (report-level)

The report resolves each entity's website through a priority chain. All candidates are validated by `isValidProductUrl()`, which rejects aggregator URLs, pseudo-domains, and malformed URLs:
1. `entity.website_url` (set by extractor, classifier, or enricher)
2. `enrichment.metrics.website` (found during research)
3. `entity.canonical_domain` (if not a pseudo-domain and contains a dot)
4. Evidence URLs (first valid product URL)

### Report styling

Reports use the same dark theme as the dashboard (matching CSS variables, colors, and card styles). They are rendered in an in-app modal with an option to open in a new tab.

---

## Cron Schedule

| Job | Default Schedule | Env Variable |
| --- | --- | --- |
| Full pipeline (scan → enrich → report) | Daily at 8:00 AM UTC | `SCAN_CRON` |

A single daily cron runs the entire pipeline. The scan discovers new startups, enrichment researches them, and a report is auto-generated with all new findings.

---

## Frontend Dashboard

The app serves an embedded dashboard at `/` — no separate frontend build or deployment required.

### Features

- **Entity Grid** — all discovered AI startups displayed as cards with metrics (revenue, funding, users, team size), search, category filter, and sorting (Revenue First, Recently Updated, Newest First, Name A–Z)
- **Entity Detail Modal** — click any card to see full metrics, signals, evidence, source mentions, and discovery timeline
- **Scan Pipeline** — one-click "Scan for New Startups" button triggers the full pipeline (scan → enrich → report) with a **3-step progress tracker** showing live status for each stage (e.g. "600 sources crawled · 56 unseen · 10 extracted")
- **Pipeline Persistence** — refreshing the page mid-scan automatically detects and resumes progress tracking
- **Smart Entity Names** — frontend `bestName()` picks the best non-generic name across `clean_name`, `matched_name`, and `name`
- **Report Modal** — "Newest Startup Report" opens the latest report in an in-app modal (dark-themed, matching the dashboard). Option to open in a new tab
- **Past Reports** — dropdown in the navbar listing all historical reports, each viewable in the modal
- **Stale Run Cleanup** — scan runs stuck for 15+ minutes are auto-marked as failed; per-source 10-minute timeout prevents pipeline stalls
- **Tech Stack** — footer showing all technologies used
- **Responsive** — mobile-friendly with scrollable navbar and single-column grid

### Architecture

Static files (`index.html`, `style.css`, `app.js`) are served from `src/public/` via `express.static`. No bundler, no framework — vanilla HTML/CSS/JS with `fetch` for API calls and DOM manipulation for updates. Responses are Gzip-compressed via the `compression` middleware.

---

## Deployment (Railway)

The app is deployed to [Railway](https://railway.app) with automatic GitHub integration.

### Setup

1. Connect your GitHub repo to a new Railway project
2. Set all [environment variables](#environment-variables) in Railway's dashboard
3. Railway auto-detects `npm start` from `package.json`
4. Set the **target port** in Railway Networking to match the auto-assigned `PORT` (typically `8080`)

### Requirements

- **MongoDB Atlas:** add `0.0.0.0/0` to the Atlas Network Access IP allowlist so Railway's dynamic IPs can connect
- **No Dockerfile needed** — Railway uses Nixpacks to detect Node.js and runs `npm start`
- Pushes to `main` trigger automatic redeployments
