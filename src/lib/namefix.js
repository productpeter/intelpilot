/**
 * Determines if an entity name should be replaced by enrichment's matched_name.
 * Returns the better name, or null if no change needed.
 */
export function betterName(currentName, currentClean, matchedName, websiteUrl) {
  const research = (matchedName || '').trim();
  if (!research || research.length > 40 || research.split(/\s+/).length > 5) return null;

  const cur = currentClean || currentName || '';
  if (cur.toLowerCase().trim() === research.toLowerCase().trim()) return null;

  const isGeneric = /^(AI |An AI |The )/i.test(cur) || cur.length > 30;
  if (isGeneric) return research;

  if (websiteUrl && cur.length >= 2) {
    const curFits = nameMatchesDomain(cur, websiteUrl);
    const resFits = nameMatchesDomain(research, websiteUrl);
    if (!curFits && resFits) return research;
  }

  if (cur.length <= 2) return research;

  return null;
}

function nameMatchesDomain(name, url) {
  if (!name || !url) return false;
  try {
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const base = host.split('.')[0];
    const domainParts = base.split(/[-_]/).filter((p) => p.length > 1);
    const nameLower = name.toLowerCase();
    const nameWords = nameLower.split(/[\s.\-_]+/).filter((w) => w.length > 1);

    for (const dp of domainParts) {
      if (nameLower.includes(dp)) return true;
      for (const nw of nameWords) {
        if (dp.includes(nw) || nw.includes(dp)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
