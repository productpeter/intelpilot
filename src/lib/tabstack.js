import axios from 'axios';
import config from '../config/index.js';

const client = axios.create({
  baseURL: config.tabstack.baseUrl,
  headers: {
    Authorization: `Bearer ${config.tabstack.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 120_000,
});

export async function extractJson(url, jsonSchema, options = {}) {
  const { data } = await client.post('/v1/extract/json', {
    url,
    json_schema: jsonSchema,
    nocache: options.nocache ?? false,
    ...(options.geoTarget && { geo_target: options.geoTarget }),
  });
  return data;
}

export async function extractMarkdown(url, options = {}) {
  const { data } = await client.post('/v1/extract/markdown', {
    url,
    nocache: options.nocache ?? false,
  });
  return data;
}

// ── Extraction schemas per source type ──────────────────────────────

export const SCHEMAS = {
  genericPage: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The main title or heading of the page',
      },
      entity_name: {
        type: 'string',
        description: 'The company or product name featured on this page',
      },
      domain: {
        type: 'string',
        description: 'The canonical domain of the company/product (e.g. example.com)',
      },
      description: {
        type: 'string',
        description: 'A short 1-2 sentence description of the company/product',
      },
      published_date: {
        type: ['string', 'null'],
        description: 'Publication or launch date if available (ISO 8601)',
      },
      snippets: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Key text snippets related to traction, pricing, revenue, or customer claims',
      },
      pricing_text: {
        type: ['string', 'null'],
        description: 'Any pricing information mentioned on the page',
      },
      revenue_mentions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Explicit MRR, ARR, or revenue claims found on the page',
      },
      customer_count_mentions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Claims about number of customers or users (e.g. "500 customers", "10k users")',
      },
      relevant_links: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            url: { type: 'string' },
          },
        },
        description: 'Important links: pricing page, homepage, docs, GitHub repo',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Category or topic tags inferred from the content (e.g. AI, SaaS, Developer Tools)',
      },
    },
    required: ['title'],
  },

  productHuntListing: {
    type: 'object',
    properties: {
      products: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Product name' },
            tagline: { type: 'string', description: 'Product tagline' },
            url: { type: 'string', description: 'Product Hunt URL for this product' },
            website: {
              type: ['string', 'null'],
              description: 'External product website URL',
            },
            upvotes: { type: 'number', description: 'Number of upvotes' },
            topics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Topic tags',
            },
            maker: { type: ['string', 'null'], description: 'Maker name if shown' },
          },
          required: ['name', 'tagline'],
        },
      },
    },
    required: ['products'],
  },

  hackerNewsShowHN: {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Post title (including "Show HN:" prefix)',
            },
            url: { type: ['string', 'null'], description: 'External URL if linked' },
            hn_url: { type: 'string', description: 'Hacker News discussion URL' },
            points: { type: 'number', description: 'Number of points' },
            author: { type: 'string', description: 'Username who posted' },
            comments_count: { type: 'number', description: 'Number of comments' },
            posted_at: {
              type: ['string', 'null'],
              description: 'When it was posted, e.g. "2 hours ago"',
            },
          },
          required: ['title'],
        },
      },
    },
    required: ['posts'],
  },

  rssFeedPage: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Article title' },
            url: { type: 'string', description: 'Article URL' },
            summary: {
              type: ['string', 'null'],
              description: 'Article summary or excerpt',
            },
            author: { type: ['string', 'null'], description: 'Author name' },
            published_date: {
              type: ['string', 'null'],
              description: 'Publication date',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Category or topic tags',
            },
          },
          required: ['title', 'url'],
        },
      },
    },
    required: ['articles'],
  },
};
