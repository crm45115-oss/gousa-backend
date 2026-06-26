function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

function extractJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const direct = safeJsonParse(raw, null);
  if (direct && typeof direct === 'object') return direct;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = safeJsonParse(fenced[1], null);
    if (parsed && typeof parsed === 'object') return parsed;
  }

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const parsed = safeJsonParse(raw.slice(first, last + 1), null);
    if (parsed && typeof parsed === 'object') return parsed;
  }
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function limitText(text = '', max = 3500) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '…' : value;
}

module.exports = { onlyDigits, safeJsonParse, cleanText, pickFirst, extractJsonObject, nowIso, limitText };
