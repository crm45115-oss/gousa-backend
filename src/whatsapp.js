const crypto = require('crypto');
const { config } = require('./env');
const { onlyDigits } = require('./utils');

function verifyMetaSignature(req) {
  if (!config.metaAppSecret) return true;
  const header = req.get('x-hub-signature-256');
  if (!header || !req.rawBody) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', config.metaAppSecret)
    .update(req.rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

function extractIncomingEvents(payload = {}) {
  const events = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || '';
      const displayPhoneNumber = value.metadata?.display_phone_number || '';
      const contactsByWaId = new Map((value.contacts || []).map((c) => [c.wa_id, c]));

      for (const message of value.messages || []) {
        const contact = contactsByWaId.get(message.from) || {};
        const extracted = extractMessageText(message);
        events.push({
          phoneNumberId,
          displayPhoneNumber,
          from: onlyDigits(message.from),
          waMessageId: message.id,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          type: message.type || extracted.type || 'text',
          text: extracted.text,
          rawMessage: message,
          contactName: contact.profile?.name || ''
        });
      }
    }
  }
  return events;
}

function extractMessageText(message = {}) {
  if (message.text?.body) return { type: 'text', text: message.text.body };
  if (message.button?.text) return { type: 'button', text: message.button.text };
  if (message.interactive?.button_reply) {
    return { type: 'interactive', text: message.interactive.button_reply.title || message.interactive.button_reply.id };
  }
  if (message.interactive?.list_reply) {
    return { type: 'interactive', text: message.interactive.list_reply.title || message.interactive.list_reply.id };
  }
  if (message.image) return { type: 'image', text: message.image.caption || '[Imagen recibida]' };
  if (message.document) return { type: 'document', text: message.document.caption || `[Documento recibido: ${message.document.filename || 'archivo'}]` };
  if (message.audio) return { type: 'audio', text: '[Audio recibido. Derivar a asesor si no se transcribe.]' };
  if (message.video) return { type: 'video', text: message.video.caption || '[Video recibido]' };
  if (message.location) return { type: 'location', text: `[Ubicación recibida: ${message.location.latitude}, ${message.location.longitude}]` };
  return { type: message.type || 'unknown', text: '[Mensaje recibido]' };
}

async function sendWhatsAppText({ to, text, phoneNumberId = config.phoneNumberId }) {
  if (!phoneNumberId) throw new Error('Falta PHONE_NUMBER_ID.');
  const cleanTo = onlyDigits(to);
  if (!cleanTo) throw new Error('Falta destinatario WhatsApp.');

  const url = `https://graph.facebook.com/${config.metaApiVersion}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.metaAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body: String(text || '').slice(0, 4096) }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.message || `Error HTTP ${response.status}`;
    throw new Error(`Meta Cloud API: ${error}`);
  }
  return data;
}

async function markMessageRead({ messageId, phoneNumberId = config.phoneNumberId }) {
  if (!messageId || !phoneNumberId) return null;
  const url = `https://graph.facebook.com/${config.metaApiVersion}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.metaAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    })
  });
  return response.json().catch(() => null);
}

module.exports = { verifyMetaSignature, extractIncomingEvents, sendWhatsAppText, markMessageRead };
