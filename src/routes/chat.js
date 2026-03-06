import { Router } from 'express';
import { col } from '../db/mongo.js';
import { getEmbedding } from '../lib/embeddings.js';
import { chatStream } from '../lib/openai.js';

const router = Router();

const SYSTEM_PROMPT = `You are IntelPilot AI, an expert startup intelligence assistant. You have access to a curated database of AI startups with verified metrics.

When answering questions:
- Ground every claim in the data provided. Cite specific startup names, metrics, and sources.
- If the data doesn't contain enough information to answer, say so honestly.
- Be concise and direct. Use bullet points for lists.
- When comparing startups, use tables or structured formats.
- If asked about a startup not in the results, say you don't have data on it rather than guessing.
- You can reason about the data (e.g. trends, comparisons, recommendations) but always based on what's provided.`;

function formatEntityContext(entity) {
  const m = entity.enrichment?.metrics || {};
  const cls = entity.classification || {};
  const parts = [`**${entity.name}**`];
  if (entity.canonical_domain) parts.push(`Domain: ${entity.canonical_domain}`);
  if (cls.category) parts.push(`Category: ${cls.category}`);
  if (entity.description || m.description) parts.push(`About: ${entity.description || m.description}`);
  if (m.revenue) parts.push(`Revenue: ${m.revenue}`);
  if (m.funding) parts.push(`Funding: ${m.funding}`);
  if (m.team_size) parts.push(`Team: ${m.team_size}`);
  if (m.user_count) parts.push(`Users: ${m.user_count}`);
  if (m.growth) parts.push(`Growth: ${m.growth}`);
  if (m.monthly_traffic) parts.push(`Traffic: ${m.monthly_traffic}`);
  if (m.tech_stack) parts.push(`Tech Stack: ${m.tech_stack}`);
  if (m.founded_year) parts.push(`Founded: ${m.founded_year}`);
  if (m.notable) parts.push(`Notable: ${m.notable}`);

  const news = entity.enrichment?.recent_news;
  if (news?.length) {
    parts.push(`Recent News: ${news.map((n) => n.title).join('; ')}`);
  }
  return parts.join('\n');
}

async function vectorSearch(queryVector, limit = 10) {
  const pipeline = [
    {
      $vectorSearch: {
        index: 'entity_embedding_index',
        path: 'embedding',
        queryVector,
        numCandidates: limit * 10,
        limit,
      },
    },
    {
      $project: {
        embedding: 0,
      },
    },
  ];
  return col('entities').aggregate(pipeline).toArray();
}

async function getTopEntities(limit = 10) {
  return col('entities')
    .find({ 'classification.is_startup': true, 'enrichment.web_verified': true })
    .sort({ updated_at: -1 })
    .limit(limit)
    .project({ embedding: 0 })
    .toArray();
}

router.post('/', async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    let entities;
    try {
      const queryEmbedding = await getEmbedding(message);
      entities = await vectorSearch(queryEmbedding, 12);
    } catch (err) {
      console.warn('[Chat] Vector search failed, falling back to top entities:', err.message);
      entities = await getTopEntities(12);
    }

    const context = entities.map(formatEntityContext).join('\n\n---\n\n');

    const totalCount = await col('entities').countDocuments({ 'classification.is_startup': true });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `DATABASE CONTEXT (${entities.length} most relevant of ${totalCount} total startups):\n\n${context}`,
      },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = await chatStream(messages);

    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          res.write('data: [DONE]\n\n');
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch {}
      }
    });

    stream.on('end', () => {
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    });

    stream.on('error', (err) => {
      console.error('[Chat] Stream error:', err.message);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
        res.end();
      }
    });

    req.on('close', () => {
      stream.destroy();
    });
  } catch (err) {
    console.error('[Chat] Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat failed' });
    }
  }
});

export default router;
