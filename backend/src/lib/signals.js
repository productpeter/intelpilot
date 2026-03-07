const SIGNAL_PATTERNS = {
  revenue_claim: [
    { regex: /\$[\d,.]+[kKmMbB]?\s*(?:MRR|ARR|revenue)/i, confidence: 0.9 },
    { regex: /(?:MRR|ARR|revenue)\s*(?:of|:)?\s*\$[\d,.]+[kKmMbB]?/i, confidence: 0.9 },
    {
      regex: /(?:making|earning|generating|doing|hitting|reached|crossed)\s*\$[\d,.]+[kKmMbB]?\s*(?:per\s*month|monthly|annually|per\s*year|\/mo|\/yr)?/i,
      confidence: 0.85,
    },
    {
      regex: /(?:run[- ]?rate|gross\s*revenue|net\s*revenue|total\s*revenue|recurring\s*revenue)\s*(?:of|:)?\s*\$[\d,.]+[kKmMbB]?/i,
      confidence: 0.9,
    },
    { regex: /\$[\d,.]+[kKmMbB]?\s*(?:\/\s*(?:mo|month|year|yr))\s*(?:in\s+)?revenue/i, confidence: 0.85 },
    { regex: /(?:grew|growth|from)\s*\$[\d,.]+[kKmMbB]?\s*to\s*\$[\d,.]+[kKmMbB]?/i, confidence: 0.8 },
    { regex: /\b\d+[kKmM]\s*(?:MRR|ARR)\b/i, confidence: 0.85 },
    { regex: /(?:profit|income|sales)\s*(?:of|:)?\s*\$[\d,.]+[kKmMbB]?/i, confidence: 0.75 },
    { regex: /(?:bootstrapped|self-funded)\s*to\s*\$[\d,.]+[kKmMbB]?/i, confidence: 0.8 },
  ],
  customer_count_claim: [
    { regex: /(\d[\d,]*)\s*(?:customers|users|clients|teams|companies)/i, confidence: 0.8 },
    {
      regex: /(?:used\s*by|trusted\s*by|serving)\s*(\d[\d,]*)\s*\+?\s*(?:customers|users|companies|teams)/i,
      confidence: 0.8,
    },
    { regex: /(\d+[kKmM]\+?)\s*(?:customers|users|downloads)/i, confidence: 0.75 },
    { regex: /(?:paying)\s*(?:customers|users)\s*[:=]?\s*(\d[\d,kKmM]*)/i, confidence: 0.85 },
  ],
  pricing_present: [
    { regex: /\$\d+[\d,.]*\s*\/\s*(?:mo|month|year|yr|user|seat)/i, confidence: 0.9 },
    {
      regex: /(?:pricing|plans?\s+(?:start|from)|free\s+(?:tier|plan)|enterprise\s+plan)/i,
      confidence: 0.7,
    },
    { regex: /(?:starter|pro|business|enterprise)\s*[-–:]\s*\$\d+/i, confidence: 0.85 },
  ],
  launch_announcement: [
    {
      regex: /(?:launching|just\s+launched|we['']re\s+live|now\s+available|introducing|announcing)/i,
      confidence: 0.8,
    },
    { regex: /Show HN:/i, confidence: 0.9 },
    { regex: /(?:Product\s*Hunt|ProductHunt)\s+(?:launch|today)/i, confidence: 0.85 },
  ],
  funding_raised: [
    { regex: /(?:raised|closed|secured)\s*\$[\d,.]+[kKmMbB]?\s*(?:seed|pre-seed|series\s*[a-d]|round)?/i, confidence: 0.9 },
    { regex: /\$[\d,.]+[kKmMbB]?\s*(?:seed|pre-seed|series\s*[a-d])\s*(?:round|funding)/i, confidence: 0.9 },
    { regex: /(?:YC|Y\s*Combinator|Techstars|500\s*Startups)\s*(?:[WSF]\d{2})?/i, confidence: 0.85 },
    { regex: /(?:backed\s*by|funded\s*by|invested\s*by)\s*[\w\s]+/i, confidence: 0.7 },
    { regex: /\bbootstrapped\b/i, confidence: 0.75 },
  ],
  growth_rate: [
    { regex: /(?:grew|growth|growing)\s*\d+%\s*(?:MoM|month.over.month|monthly)/i, confidence: 0.9 },
    { regex: /(?:grew|growth|growing)\s*\d+%\s*(?:YoY|year.over.year|annually)/i, confidence: 0.9 },
    { regex: /(?:doubled|tripled|10x|2x|3x|5x)\s*(?:in|over|within)\s*\d+\s*(?:months?|weeks?|years?)/i, confidence: 0.85 },
    { regex: /(?:\d+x|\d+%)\s*(?:revenue|user|customer|growth)\s*(?:growth|increase)?/i, confidence: 0.8 },
    { regex: /(?:from\s*\$?[\d,.]+[kKmM]?\s*to\s*\$?[\d,.]+[kKmM]?)/i, confidence: 0.75 },
  ],
  team_size: [
    { regex: /\b(?:solo\s*founder|solopreneur|one.person|1.person)\b/i, confidence: 0.85 },
    { regex: /\b(?:team\s*of|crew\s*of)\s*(\d+)/i, confidence: 0.8 },
    { regex: /\b(\d+)[\s-]*(?:person|people|member|employee)\s*(?:team|company|startup)?/i, confidence: 0.8 },
    { regex: /\b(?:co-?founders?|founding\s*team)\b/i, confidence: 0.7 },
    { regex: /\b(\d+)\s*(?:employees|engineers|developers)\b/i, confidence: 0.8 },
  ],
  user_count: [
    { regex: /(\d[\d,]*[kKmM]?)\s*(?:DAU|daily\s*active\s*users)/i, confidence: 0.9 },
    { regex: /(\d[\d,]*[kKmM]?)\s*(?:MAU|monthly\s*active\s*users)/i, confidence: 0.9 },
    { regex: /(\d[\d,]*[kKmM]?)\s*(?:downloads|installs)/i, confidence: 0.8 },
    { regex: /(\d[\d,]*[kKmM]?)\s*(?:signups?|sign-ups?|registered\s*users)/i, confidence: 0.8 },
    { regex: /(?:waitlist|wait\s*list)\s*(?:of)?\s*(\d[\d,]*[kKmM]?)/i, confidence: 0.8 },
    { regex: /(\d[\d,]*[kKmM]?)\s*(?:on\s*(?:the\s*)?waitlist|on\s*wait\s*list)/i, confidence: 0.8 },
  ],
};

export function extractSignals(text, snippets = []) {
  const allText = [text, ...snippets].join('\n');
  const signals = [];

  for (const [signalType, patterns] of Object.entries(SIGNAL_PATTERNS)) {
    for (const { regex, confidence } of patterns) {
      const match = allText.match(regex);
      if (match) {
        signals.push({
          signal_type: signalType,
          value_text: match[0].trim(),
          value_num: parseNumericValue(match[0]),
          unit: parseUnit(match[0]),
          confidence,
        });
        break;
      }
    }
  }

  return signals;
}

export function addTrendSignals(tags = []) {
  return tags.map((tag) => ({
    signal_type: 'trend_indicator',
    value_text: tag,
    value_num: null,
    unit: null,
    confidence: 0.6,
  }));
}

function parseNumericValue(text) {
  const match = text.match(/[\d,.]+[kKmMbB]?/);
  if (!match) return null;
  const raw = match[0].replace(/,/g, '');
  const suffix = raw.slice(-1).toLowerCase();
  if (suffix === 'k') return parseFloat(raw) * 1_000;
  if (suffix === 'm') return parseFloat(raw) * 1_000_000;
  if (suffix === 'b') return parseFloat(raw) * 1_000_000_000;
  return parseFloat(raw) || null;
}

function parseUnit(text) {
  if (/MRR/i.test(text)) return 'MRR';
  if (/ARR/i.test(text)) return 'ARR';
  if (/revenue/i.test(text)) return 'revenue';
  if (/profit|income/i.test(text)) return 'profit';
  if (/sales/i.test(text)) return 'sales';
  if (/month|\/mo|MoM/i.test(text)) return 'per_month';
  if (/year|annually|\/yr|YoY/i.test(text)) return 'per_year';
  if (/DAU/i.test(text)) return 'DAU';
  if (/MAU/i.test(text)) return 'MAU';
  if (/downloads?|installs?/i.test(text)) return 'downloads';
  if (/signups?|registered/i.test(text)) return 'signups';
  if (/waitlist/i.test(text)) return 'waitlist';
  if (/users?/i.test(text)) return 'users';
  if (/customers?/i.test(text)) return 'customers';
  if (/employees?|engineers?|developers?|people|person|team/i.test(text)) return 'team';
  if (/seed|series|round|funding/i.test(text)) return 'funding';
  return null;
}
