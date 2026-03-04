import { chatJson } from '../lib/openai.js';
import { col } from '../db/mongo.js';
import { isValidProductUrl } from './extractor.js';

const SYSTEM_PROMPT = `You are an AI startup classifier. Given information about an entity discovered from the web, determine whether it represents an actual AI/ML startup or product.

Respond with JSON:
{
  "is_startup": boolean,
  "confidence": number between 0 and 1,
  "clean_name": "The actual product or company name (1-4 words max)",
  "one_liner": "A concise one-line description of what the product/company does",
  "category": "Specific AI sub-category (e.g. AI Agent, LLM Tool, AI SaaS, Computer Vision, NLP, AI Infrastructure, AI Developer Tools, AI Healthcare, AI Fintech, etc.)",
  "website_url": "The startup's OWN website URL (their product homepage), or null"
}

Rules:
- is_startup = true ONLY for AI/ML startups and products. The product must use AI, machine learning, LLMs, or related technology as a core feature.
- is_startup = false for: non-AI startups (pure SaaS without AI, e-commerce, social networks, games without AI), news articles, opinion pieces, questions, personal blogs, publicly traded mega-corporations (Google, Microsoft, Meta, Amazon, Apple, Nvidia, Intel, IBM, Oracle, Salesforce, Adobe, Samsung, Sony), general discussions, portfolio/personal websites, agencies, consulting firms, defunct projects, posts where someone talks about building something but never names the product
- is_startup = true for ALL private AI/ML companies regardless of size (e.g. Cursor, Perplexity, Midjourney, Anthropic, OpenAI, Cohere, Mistral, Scale AI, etc. are all valid)
- clean_name MUST be a short product/company name (1-4 words max), NOT a Reddit post title or sentence
- If you cannot determine a clear product name, set clean_name to null and is_startup to false
- website_url: This MUST be the startup's OWN product website (e.g. "https://nowigetit.us", "https://linear.app", "https://cursor.com").
  NEVER return the URL of an article, blog post, news site, Product Hunt listing, Hacker News thread, Reddit post, or any other page that *discusses* the startup.
  NEVER return URLs from: producthunt.com, news.ycombinator.com, reddit.com, techcrunch.com, medium.com, tldr.tech, venturebeat.com, betalist.com, dev.to, hackernoon.com, substack.com, youtube.com, twitter.com, x.com, linkedin.com, github.com, crunchbase.com.
  If the domain field looks like a real product domain (not an aggregator), use https:// + that domain.
  If you cannot identify the product's own website, return null.
- Examples of GOOD entries: "Cursor" (AI code editor), "Perplexity" (AI search), "Midjourney" (AI image gen)
- Examples of BAD entries: "TopoMaker" (3D modeling, no AI), "Sitter Rank" (pet marketplace, no AI), "Bonetflix" (browser extension, no AI)`;

export async function classifyEntity(entity, evidenceSnippet) {
  const input = [
    `Name: ${entity.name}`,
    entity.canonical_domain ? `Domain: ${entity.canonical_domain}` : null,
    entity.description ? `Description: ${entity.description}` : null,
    entity.tags?.length ? `Tags: ${entity.tags.slice(0, 10).join(', ')}` : null,
    evidenceSnippet ? `Evidence: ${evidenceSnippet.slice(0, 400)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await chatJson(SYSTEM_PROMPT, input);

    let cleanName = result.clean_name || null;
    if (cleanName && (cleanName.length > 40 || cleanName.split(/\s+/).length > 5)) {
      cleanName = null;
    }

    let websiteUrl = result.website_url || null;
    if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
      if (/^\//.test(websiteUrl) || !websiteUrl.includes('.')) {
        websiteUrl = null;
      } else {
        websiteUrl = `https://${websiteUrl}`;
      }
    }
    if (websiteUrl && !isValidProductUrl(websiteUrl)) {
      console.log(`[Classifier] Rejected invalid URL as website: ${websiteUrl}`);
      websiteUrl = null;
    }

    const classification = {
      is_startup: cleanName ? !!result.is_startup : false,
      confidence: Math.min(1, Math.max(0, result.confidence || 0)),
      clean_name: cleanName,
      one_liner: result.one_liner || null,
      category: result.category || null,
      website_url: websiteUrl,
      classified_at: new Date(),
    };

    const existingWebsite = entity.website_url;
    const shouldUpdateWebsite = websiteUrl && (!existingWebsite || !isValidProductUrl(existingWebsite));

    const updates = {
      classification,
      ...(classification.clean_name && { name: classification.clean_name }),
      ...(classification.one_liner && { description: classification.one_liner }),
      ...(shouldUpdateWebsite && { website_url: websiteUrl }),
    };

    await col('entities').updateOne(
      { _id: entity._id },
      { $set: updates },
    );

    console.log(
      `[Classifier] ${entity.name} → ${classification.is_startup ? 'AI STARTUP' : 'skip'} (${classification.clean_name || 'no name'}, ${Math.round(classification.confidence * 100)}%)`,
    );

    return classification;
  } catch (err) {
    console.warn(`[Classifier] Failed for "${entity.name}":`, err.message);
    return { is_startup: false, confidence: 0, clean_name: null, one_liner: null, category: null, website_url: null };
  }
}
