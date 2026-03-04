import { col } from '../db/mongo.js';
import { getEmbedding, buildEntityEmbeddingText } from '../lib/embeddings.js';

const SIMILARITY_THRESHOLD = 0.85;

export async function resolveEntity(candidate) {
  if (candidate.canonical_domain) {
    const byDomain = await col('entities').findOne({
      canonical_domain: candidate.canonical_domain,
    });
    if (byDomain) {
      await mergeEntityFields(byDomain._id, candidate);
      return byDomain;
    }
  }

  const byName = await col('entities').findOne({
    name: { $regex: new RegExp(`^${escapeRegex(candidate.name)}$`, 'i') },
  });
  if (byName) {
    await mergeEntityFields(byName._id, candidate);
    return byName;
  }

  const embeddingText = buildEntityEmbeddingText(candidate);
  let embedding;
  try {
    embedding = await getEmbedding(embeddingText);
  } catch (err) {
    console.warn('[Entities] Embedding generation failed, skipping vector dedup:', err.message);
    return createEntity(candidate, null);
  }

  try {
    const similar = await vectorSearch(embedding, 3);
    if (similar.length > 0 && similar[0].score >= SIMILARITY_THRESHOLD) {
      const match = similar[0];
      console.log(
        `[Entities] Vector match: "${candidate.name}" ≈ "${match.name}" (${match.score.toFixed(3)})`,
      );
      await mergeEntityFields(match._id, candidate);
      return await col('entities').findOne({ _id: match._id });
    }
    if (similar.length > 0 && similar[0].score >= 0.7) {
      console.log(
        `[Entities] Possible duplicate: "${candidate.name}" ≈ "${similar[0].name}" (${similar[0].score.toFixed(3)})`,
      );
    }
  } catch (err) {
    console.warn('[Entities] Vector search failed (index may not exist yet):', err.message);
  }

  return createEntity(candidate, embedding);
}

async function createEntity(candidate, embedding) {
  const now = new Date();
  const entity = {
    name: candidate.name,
    canonical_domain: candidate.canonical_domain || null,
    description: candidate.description || '',
    tags: [...new Set(candidate.tags || [])],
    identifiers: candidate.identifiers || {},
    ...(candidate.website_url && { website_url: candidate.website_url }),
    created_at: now,
    updated_at: now,
    embedding,
    embedding_model: 'text-embedding-3-large',
    embedding_version: 'v1',
  };

  const { insertedId } = await col('entities').insertOne(entity);
  entity._id = insertedId;
  console.log(`[Entities] Created: "${entity.name}" (${insertedId})`);
  return entity;
}

async function mergeEntityFields(entityId, candidate) {
  const existing = await col('entities').findOne({ _id: entityId });
  const $set = { updated_at: new Date() };
  const $addToSet = {};

  if (candidate.canonical_domain) $set.canonical_domain = candidate.canonical_domain;
  if (candidate.description && !existing?.enrichment) $set.description = candidate.description;

  if (candidate.website_url && !existing?.website_url) {
    $set.website_url = candidate.website_url;
  }

  if (candidate.tags?.length) $addToSet.tags = { $each: candidate.tags };

  if (candidate.identifiers) {
    for (const [key, val] of Object.entries(candidate.identifiers)) {
      $set[`identifiers.${key}`] = val;
    }
  }

  const op = { $set };
  if (Object.keys($addToSet).length) op.$addToSet = $addToSet;

  await col('entities').updateOne({ _id: entityId }, op);
}

async function vectorSearch(queryVector, limit = 5) {
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
        name: 1,
        canonical_domain: 1,
        description: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];
  return col('entities').aggregate(pipeline).toArray();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
