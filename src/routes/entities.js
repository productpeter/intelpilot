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
  const lim = Math.min(parseInt(limit, 10) || 50, 500);
  const sk = parseInt(skip, 10) || 0;

  const [data, total] = await Promise.all([
    col('entities')
      .find(filter, { projection: { embedding: 0 } })
      .sort({ [sort]: sortDir })
      .skip(sk)
      .limit(lim)
      .toArray(),
    col('entities').countDocuments(filter),
  ]);

  res.json({ data, total, limit: lim, skip: sk });
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

  const [signals, directEvidence, discoveries] = await Promise.all([
    col('signals')
      .find({ entity_id: entityId })
      .sort({ captured_at: -1 })
      .limit(50)
      .toArray(),
    col('evidence')
      .find({ entity_id: entityId })
      .sort({ captured_at: -1 })
      .limit(20)
      .toArray(),
    col('discoveries')
      .find({ entity_id: entityId })
      .sort({ discovered_at: -1 })
      .limit(20)
      .toArray(),
  ]);

  const signalEvidenceIds = [...new Set(signals.map((s) => s.evidence_id).filter(Boolean))];
  const signalEvidence = signalEvidenceIds.length
    ? await col('evidence').find({ _id: { $in: signalEvidenceIds } }).toArray()
    : [];

  const evidenceMap = new Map();
  for (const e of [...directEvidence, ...signalEvidence]) {
    evidenceMap.set(e._id.toString(), e);
  }
  const evidence = [...evidenceMap.values()];

  res.json({ ...entity, signals, evidence, discoveries });
});

export default router;
