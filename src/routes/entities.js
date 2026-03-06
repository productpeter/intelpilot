import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { col } from '../db/mongo.js';

const router = Router();

router.get('/', async (req, res) => {
  const { sort = 'updated_at', order = 'desc', limit = '50', skip = '0', tag, all } = req.query;

  const filter = {};
  if (all !== 'true') {
    filter['classification.is_startup'] = true;
    filter['classification.clean_name'] = { $ne: null };
  }
  if (tag) filter.tags = tag;

  const sortDir = order === 'asc' ? 1 : -1;
  const lim = parseInt(limit, 10) || 50;
  const sk = parseInt(skip, 10) || 0;

  const listProjection = {
    name: 1,
    description: 1,
    website_url: 1,
    classification: 1,
    'enrichment.metrics': 1,
    'enrichment.web_verified': 1,
    'enrichment.enriched_at': 1,
    updated_at: 1,
    created_at: 1,
  };

  const [data, total] = await Promise.all([
    col('entities')
      .find(filter, { projection: listProjection })
      .sort({ [sort]: sortDir })
      .allowDiskUse()
      .skip(sk)
      .limit(lim)
      .toArray(),
    col('entities').countDocuments(filter),
  ]);

  res.json({ data, total, limit: lim, skip: sk });
});

router.get('/cluster-map', async (req, res) => {
  try {
    const entities = await col('entities')
      .find(
        { 'classification.is_startup': true, embedding: { $exists: true, $ne: null } },
        {
          projection: {
            name: 1, classification: 1, 'enrichment.metrics': 1,
            website_url: 1, embedding: 1,
          },
        },
      )
      .sort({ updated_at: -1 })
      .limit(400)
      .toArray();

    if (!entities.length) return res.json({ nodes: [] });

    const dim = entities[0].embedding.length;

    // Seeded random projection vectors for consistent 2D layout
    function seededRandom(seed) {
      let s = seed;
      return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(137);
    const proj1 = Array.from({ length: dim }, () => rng1() - 0.5);
    const proj2 = Array.from({ length: dim }, () => rng2() - 0.5);
    const mag1 = Math.sqrt(proj1.reduce((s, v) => s + v * v, 0));
    const mag2 = Math.sqrt(proj2.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < dim; i++) { proj1[i] /= mag1; proj2[i] /= mag2; }

    const points = entities.map((e) => {
      const emb = e.embedding;
      let x = 0, y = 0;
      for (let i = 0; i < dim; i++) { x += emb[i] * proj1[i]; y += emb[i] * proj2[i]; }
      return { x, y, id: e._id, name: e.name, entity: e };
    });

    // Normalize to 0-1 range
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const nodes = points.map((p) => {
      const e = p.entity;
      const m = e.enrichment?.metrics || {};
      return {
        _id: e._id,
        x: (p.x - minX) / rangeX,
        y: (p.y - minY) / rangeY,
        name: e.classification?.clean_name || e.name,
        category: e.classification?.category || 'Other',
        revenue: m.revenue || null,
        funding: m.funding || null,
        traffic: m.monthly_traffic || null,
        tech_stack: m.tech_stack || null,
      };
    });

    res.json({ nodes, count: nodes.length });
  } catch (err) {
    console.error('[ClusterMap] Error:', err);
    res.status(500).json({ error: 'Failed to generate cluster map' });
  }
});

router.get('/:id', async (req, res) => {
  let entityId;
  try {
    entityId = new ObjectId(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid entity ID' });
  }

  const entity = await col('entities').findOne(
    { _id: entityId },
    { projection: { embedding: 0 } },
  );
  if (!entity) return res.status(404).json({ error: 'Entity not found' });

  const [signals, discoveries] = await Promise.all([
    col('signals')
      .find({ entity_id: entityId })
      .sort({ captured_at: -1 })
      .limit(50)
      .toArray(),
    col('discoveries')
      .find({ entity_id: entityId })
      .sort({ discovered_at: -1 })
      .limit(20)
      .toArray(),
  ]);

  const signalEvidenceIds = [...new Set(signals.map((s) => s.evidence_id).filter(Boolean))];
  const evidence = signalEvidenceIds.length
    ? await col('evidence').find({ _id: { $in: signalEvidenceIds } }).toArray()
    : [];

  res.json({ ...entity, signals, evidence, discoveries });
});

export default router;
