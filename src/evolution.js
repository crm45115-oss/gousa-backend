const { config } = require('./env');
const { onlyDigits } = require('./utils');

function requireEvolutionConfig() {
  if (!config.evolutionApiUrl) throw new Error('Falta EVOLUTION_API_URL en Railway.');
  if (!config.evolutionApiKey) throw new Error('Falta EVOLUTION_API_KEY en Railway.');
}

function safeInstanceName(empresaId) {
  const clean = String(empresaId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
  if (!clean) throw new Error('Falta empresa_id para crear instancia QR.');
  return `cf360_${clean}`.toLowerCase();
}

function evolutionHeaders() {
  return { 'Content-Type': 'application/json', apikey: config.evolutionApiKey };
}

async function evoRequest(path, { method = 'GET', body } = {}) {
  requireEvolutionConfig();
  const url = `${config.evolutionApiUrl}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, {
    method,
    headers: evolutionHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.response?.message || `Evolution HTTP ${res.status}`;
    const err = new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function getWebhookUrl() {
  if (!config.publicBaseUrl) throw new Error('Falta PUBLIC_BASE_URL en Railway para recibir webhook de Evolution.');
  return `${config.publicBaseUrl.replace(/\/$/, '')}/webhook/evolution`;
}

function getEvents() {
  return ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'];
}

async function createEvolutionInstance({ empresaId, number = '' }) {
  const instanceName = safeInstanceName(empresaId);
  const webhookUrl = getWebhookUrl();
  const body = {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    number: onlyDigits(number || ''),
    rejectCall: true,
    msgCall: 'Gracias por llamar. Por favor escríbenos por WhatsApp para atenderte mejor.',
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: true,
    readStatus: false,
    syncFullHistory: false,
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: getEvents()
    }
  };
  try {
    const created = await evoRequest('/instance/create', { method: 'POST', body });
    return { instanceName, created, alreadyExisted: false };
  } catch (err) {
    const text = `${err.message || ''} ${JSON.stringify(err.data || {})}`.toLowerCase();
    if (err.status === 403 || err.status === 400 || text.includes('already') || text.includes('existe') || text.includes('exists')) {
      return { instanceName, created: err.data || { message: 'Instancia ya existía' }, alreadyExisted: true };
    }
    throw err;
  }
}

async function setEvolutionWebhook(instanceName) {
  return evoRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      enabled: true,
      url: getWebhookUrl(),
      webhookByEvents: false,
      webhookBase64: true,
      events: getEvents()
    }
  });
}

async function connectEvolutionInstance(instanceName, number = '') {
  const q = number ? `?number=${encodeURIComponent(onlyDigits(number))}` : '';
  return evoRequest(`/instance/connect/${encodeURIComponent(instanceName)}${q}`);
}

async function getEvolutionState(instanceName) {
  return evoRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

async function logoutEvolutionInstance(instanceName) {
  return evoRequest(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: 'DELETE' });
}

async function sendEvolutionText({ instanceName, to, text }) {
  if (!instanceName) throw new Error('Falta instanceName para enviar por Evolution.');
  const number = onlyDigits(to);
  if (!number) throw new Error('Falta número destino.');
  return evoRequest(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: {
      number,
      text: String(text || '').slice(0, 4096),
      delay: 800,
      linkPreview: false
    }
  });
}

function extractQrFromEvolution(data = {}) {
  const base64 = data.base64 || data.qrcode?.base64 || data.qr?.base64 || data.qrCode?.base64 || data.qrcode || '';
  const code = data.code || data.qrcode?.code || data.qr?.code || data.qrCode?.code || '';
  const pairingCode = data.pairingCode || data.pairing_code || data.qrcode?.pairingCode || '';
  return { base64, code, pairingCode, raw: data };
}

function normalizeEvolutionEvent(payload = {}) {
  const instanceName = payload.instance || payload.instanceName || payload.instance_name || payload.data?.instance || payload.data?.instanceName || '';
  const event = payload.event || payload.type || payload.eventName || '';
  return { instanceName, event };
}

function extractEvolutionMessages(payload = {}) {
  const { instanceName, event } = normalizeEvolutionEvent(payload);
  const data = payload.data || payload.message || payload.messages || payload;
  const items = Array.isArray(data) ? data : [data];
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const key = item.key || item.message?.key || {};
    const fromMe = key.fromMe === true || item.fromMe === true;
    const remoteJid = key.remoteJid || item.remoteJid || item.sender || item.from || item.chatId || '';
    const from = onlyDigits(String(remoteJid).split('@')[0]);
    if (!from) continue;
    const msg = item.message || item.messages || item;
    const text =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.documentMessage?.caption ||
      msg.videoMessage?.caption ||
      item.text ||
      item.body ||
      '[Mensaje recibido]';
    let type = 'text';
    if (msg.imageMessage) type = 'image';
    else if (msg.documentMessage) type = 'document';
    else if (msg.audioMessage) { type = 'audio'; }
    else if (msg.videoMessage) type = 'video';
    out.push({
      instanceName,
      event,
      from,
      text: type === 'audio' && text === '[Mensaje recibido]' ? '[Audio recibido]' : String(text),
      type,
      waMessageId: key.id || item.id || `evo.${Date.now()}`,
      contactName: item.pushName || item.senderName || item.name || '',
      fromMe,
      rawMessage: item
    });
  }
  return out;
}

module.exports = {
  safeInstanceName,
  createEvolutionInstance,
  setEvolutionWebhook,
  connectEvolutionInstance,
  getEvolutionState,
  logoutEvolutionInstance,
  sendEvolutionText,
  extractQrFromEvolution,
  normalizeEvolutionEvent,
  extractEvolutionMessages
};
