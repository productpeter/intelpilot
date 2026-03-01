const SIGNAL_PATTERNS = {
  revenue_claim: [
    { regex: /\$[\d,.]+[kKmMbB]?\s*(?:MRR|ARR|revenue)/i, confidence: 0.85 },
    { regex: /(?:MRR|ARR|revenue)\s*(?:of|:)\s*\$[\d,.]+[kKmMbB]?/i, confidence: 0.85 },
    {
      regex: /(?:making|earning|generating)\s*\$[\d,.]+[kKmMbB]?\s*(?:per\s*month|monthly|annually|per\s*year)/i,
      confidence: 0.75,
    },
  ],
  customer_count_claim: [
    { regex: /(\d[\d,]*)\s*(?:customers|users|clients|teams|companies)/i, confidence: 0.8 },
    {
      regex: /(?:used\s*by|trusted\s*by|serving)\s*(\d[\d,]*)\s*\+?\s*(?:customers|users|companies|teams)/i,
      confidence: 0.8,
    },
    { regex: /(\d+[kKmM]\+?)\s*(?:customers|users|downloads)/i, confidence: 0.75 },
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
  if (/month/i.test(text)) return 'per_month';
  if (/year|annually/i.test(text)) return 'per_year';
  if (/users?/i.test(text)) return 'users';
  if (/customers?/i.test(text)) return 'customers';
  return null;
}
