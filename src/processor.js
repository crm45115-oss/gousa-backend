const {
  getEmpresaByPhoneNumberId,
  getIaConfig,
  getKnowledge,
  upsertLead,
  saveConversation,
  getConversationHistory,
  updateLeadFromAi,
  saveWebhookLog,
  saveMessageStatus
} = require('./db');
const { extractIncomingEvents, sendWhatsAppText, markMessageRead } = require('./whatsapp');
const { generateAiReply } = require('./ai');

async function processWebhookPayload(payload) {
  const events = extractIncomingEvents(payload);
  const results = [];

  if (!events.length) {
    try {
      const firstPhoneId = payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || '';
      const empresa = await getEmpresaByPhoneNumberId(firstPhoneId);
      await saveMessageStatus({ empresaId: empresa?.id, payload });
      await saveWebhookLog({ empresaId: empresa?.id, evento: 'webhook_status_or_empty', payload, estado: 'ok' });
    } catch (error) {
      await saveWebhookLog({ evento: 'webhook_status_or_empty_error', payload, estado: 'error', error: error.message });
    }
    return { ok: true, processed: 0, results };
  }

  for (const event of events) {
    const result = await processIncomingEvent(event, payload);
    results.push(result);
  }
  return { ok: true, processed: results.length, results };
}

async function processIncomingEvent(event, fullPayload = {}) {
  let empresa = null;
  let lead = null;
  try {
    empresa = await getEmpresaByPhoneNumberId(event.phoneNumberId);
    lead = await upsertLead({
      empresaId: empresa.id,
      telefono: event.from,
      waId: event.from,
      nombreWhatsapp: event.contactName,
      incomingText: event.text
    });

    await saveConversation({
      empresaId: empresa.id,
      leadId: lead.id,
      telefono: event.from,
      rol: 'cliente',
      mensaje: event.text,
      tipo: event.type,
      waMessageId: event.waMessageId,
      metadata: { meta: event.rawMessage, contact_name: event.contactName }
    });

    await markMessageRead({ messageId: event.waMessageId, phoneNumberId: event.phoneNumberId }).catch(() => null);

    if (lead.bloqueado) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'message_blocked_lead', payload: event, estado: 'ok' });
      return { ok: true, skipped: true, reason: 'lead_bloqueado', telefono: event.from };
    }

    const [iaConfig, knowledge, history] = await Promise.all([
      getIaConfig(empresa.id),
      getKnowledge(empresa.id),
      getConversationHistory(lead.id, event.from, 18)
    ]);

    const ai = await generateAiReply({ empresa, iaConfig, knowledge, lead, history, incomingText: event.text });
    const updatedLead = await updateLeadFromAi(lead.id, ai);

    const iaConversation = await saveConversation({
      empresaId: empresa.id,
      leadId: lead.id,
      telefono: event.from,
      rol: ai.requiere_asesor ? 'sistema' : 'ia',
      mensaje: ai.respuesta,
      tipo: 'text',
      metadata: { ai, requires_human: ai.requiere_asesor, motivo_derivacion: ai.motivo_derivacion }
    });

    const metaResponse = await sendWhatsAppText({
      to: event.from,
      text: ai.respuesta,
      phoneNumberId: event.phoneNumberId
    });

    await saveWebhookLog({
      empresaId: empresa.id,
      leadId: lead.id,
      evento: 'message_processed',
      payload: { event, ai, metaResponse, updatedLeadId: updatedLead?.id, iaConversationId: iaConversation?.id },
      estado: 'ok'
    });

    return { ok: true, telefono: event.from, lead_id: lead.id, respuesta: ai.respuesta, meta: metaResponse };
  } catch (error) {
    console.error('[processIncomingEvent]', error);
    await saveWebhookLog({
      empresaId: empresa?.id || null,
      leadId: lead?.id || null,
      evento: 'message_error',
      payload: { event, fullPayload },
      estado: 'error',
      error: error.message
    }).catch(() => null);
    return { ok: false, telefono: event.from, error: error.message };
  }
}

async function simulateIncomingMessage({ phoneNumberId, from, name, text }) {
  const fakePayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'SIMULATED_WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: name || 'Cliente Demo' }, wa_id: from }],
              messages: [
                {
                  from,
                  id: `wamid.demo.${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: text },
                  type: 'text'
                }
              ]
            }
          }
        ]
      }
    ]
  };
  return processWebhookPayload(fakePayload);
}

module.exports = { processWebhookPayload, processIncomingEvent, simulateIncomingMessage };
