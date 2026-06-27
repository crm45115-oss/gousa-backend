const {
  getEmpresaByPhoneNumberId,
  getEmpresaByEvolutionInstance,
  getIaConfig,
  getKnowledge,
  upsertLead,
  saveConversation,
  getConversationHistory,
  updateLeadFromAi,
  saveWebhookLog,
  saveMessageStatus,
  findConversationHeader,
  isRecentAiEcho,
  setConversationIaPaused,
  isConversationPaused
} = require('./db');
const { extractIncomingEvents, sendWhatsAppText, markMessageRead } = require('./whatsapp');
const { extractEvolutionMessages, sendEvolutionText, normalizeEvolutionEvent } = require('./evolution');
const { supabase } = require('./supabaseClient');
const { generateAiReply, cleanWhatsappAnswer } = require('./ai');

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
    ai.respuesta = cleanWhatsappAnswer(ai.respuesta);
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


async function processEvolutionWebhookPayload(payload) {
  const normalized = normalizeEvolutionEvent(payload);
  const results = [];

  if (String(normalized.event || '').toUpperCase().includes('CONNECTION')) {
    await updateEvolutionConnectionStatus(normalized.instanceName, payload).catch(() => null);
  }

  const events = extractEvolutionMessages(payload);
  if (!events.length) {
    await saveWebhookLog({ evento: 'evolution_webhook_empty_or_status', payload, estado: 'ok' }).catch(() => null);
    return { ok: true, processed: 0, results };
  }

  for (const event of events) {
    const result = await processEvolutionIncomingEvent(event, payload);
    results.push(result);
  }
  return { ok: true, processed: results.length, results };
}

async function updateEvolutionConnectionStatus(instanceName, payload = {}) {
  if (!instanceName) return null;
  const state = payload.data?.state || payload.state || payload.data?.connection || payload.connection || '';
  const isOpen = String(state).toLowerCase() === 'open';
  const estado = isOpen ? 'conectado' : (state ? String(state).toLowerCase() : 'pendiente');
  const { data } = await supabase
    .from('whatsapp_integraciones')
    .update({
      estado,
      conectado_en: isOpen ? new Date().toISOString() : undefined,
      desconectado_en: !isOpen && state ? new Date().toISOString() : undefined,
      metadata: { last_connection_update: payload },
      updated_at: new Date().toISOString()
    })
    .or(`instance_name.eq.${instanceName},phone_number_id.eq.${instanceName}`)
    .select('*')
    .maybeSingle();
  if (data?.empresa_id) {
    await supabase.from('empresas').update({
      estado_whatsapp: estado,
      onboarding_estado: isOpen ? 'whatsapp_qr_conectado' : 'qr_pendiente',
      updated_at: new Date().toISOString()
    }).eq('id', data.empresa_id);
  }
  return data;
}

async function processEvolutionIncomingEvent(event, fullPayload = {}) {
  let empresa = null;
  let lead = null;
  let integration = null;
  try {
    const resolved = await getEmpresaByEvolutionInstance(event.instanceName);
    empresa = resolved.empresa;
    integration = resolved.integration;

    lead = await upsertLead({
      empresaId: empresa.id,
      telefono: event.from,
      waId: event.from,
      nombreWhatsapp: event.contactName,
      incomingText: event.text
    });

    // 1) Si Evolution devuelve un mensaje saliente, puede ser:
    //    A) eco de la misma IA que acabamos de enviar por API, o
    //    B) mensaje manual escrito por el dueño desde el celular.
    //    Antes el backend pausaba ambos. Ahora solo pausa el caso B.
    if (event.fromMe) {
      const cmd = String(event.text || '').trim().toLowerCase();
      if (cmd === '/ia on' || cmd === 'ia on') {
        await setConversationIaPaused({ empresaId: empresa.id, telefono: event.from, paused: false });
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_ia_reactivated_by_whatsapp', payload: event, estado: 'ok' });
        return { ok: true, skipped: true, reason: 'ia_reactivada', telefono: event.from };
      }
      if (cmd === '/ia off' || cmd === 'ia off') {
        await setConversationIaPaused({ empresaId: empresa.id, telefono: event.from, paused: true, motivo: 'comando_ia_off' });
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_ia_paused_by_command', payload: event, estado: 'ok' });
        return { ok: true, skipped: true, reason: 'ia_pausada_comando', telefono: event.from };
      }

      const aiEcho = await isRecentAiEcho({ empresaId: empresa.id, telefono: event.from, mensaje: event.text, seconds: 360 });
      if (aiEcho) {
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_from_me_ai_echo_ignored', payload: event, estado: 'ok' });
        return { ok: true, skipped: true, reason: 'from_me_ai_echo_ignored', telefono: event.from };
      }

      await saveConversation({
        empresaId: empresa.id,
        leadId: lead.id,
        telefono: event.from,
        rol: 'asesor',
        mensaje: event.text,
        tipo: event.type,
        waMessageId: event.waMessageId,
        metadata: { provider: 'evolution', evolution: event.rawMessage, instanceName: event.instanceName, contact_name: event.contactName, from_me: true, human_manual: true }
      });

      await setConversationIaPaused({ empresaId: empresa.id, telefono: event.from, paused: true, motivo: 'humano_respondio_desde_celular' });
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_ia_paused_by_human_reply', payload: event, estado: 'ok' });
      return { ok: true, skipped: true, reason: 'from_me_human_takeover', telefono: event.from };
    }

    // 2) Mensaje entrante real del cliente: guardarlo en historial.
    await saveConversation({
      empresaId: empresa.id,
      leadId: lead.id,
      telefono: event.from,
      rol: 'cliente',
      mensaje: event.text,
      tipo: event.type,
      waMessageId: event.waMessageId,
      metadata: { provider: 'evolution', evolution: event.rawMessage, instanceName: event.instanceName, contact_name: event.contactName, from_me: false }
    });

    if (lead.bloqueado) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_message_blocked_lead', payload: event, estado: 'ok' });
      return { ok: true, skipped: true, reason: 'lead_bloqueado', telefono: event.from };
    }

    // 3) Si una persona tomó control, guardar mensaje pero NO responder con IA.
    //    Para arreglar conversaciones pausadas por el bug anterior, se auto-reactivan
    //    pausas antiguas con motivo viejo/null. Las pausas nuevas reales usan motivo
    //    humano_respondio_desde_celular o comando_ia_off y sí se respetan.
    let paused = await isConversationPaused({ empresaId: empresa.id, telefono: event.from });
    if (paused) {
      const conv = await findConversationHeader({ empresaId: empresa.id, telefono: event.from });
      const motivo = String(conv?.pausa_motivo || '').toLowerCase();
      const esPausaReal = motivo === 'humano_respondio_desde_celular' || motivo === 'comando_ia_off';
      if (!esPausaReal) {
        await setConversationIaPaused({ empresaId: empresa.id, telefono: event.from, paused: false });
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_auto_reactivate_old_false_pause', payload: { event, motivo }, estado: 'ok' });
        paused = false;
      }
    }
    if (paused) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_message_saved_ia_paused', payload: event, estado: 'ok' });
      return { ok: true, skipped: true, reason: 'ia_pausada', telefono: event.from };
    }

    const [iaConfig, knowledge, history] = await Promise.all([
      getIaConfig(empresa.id),
      getKnowledge(empresa.id),
      getConversationHistory(lead.id, event.from, 18)
    ]);

    const ai = await generateAiReply({ empresa, iaConfig, knowledge, lead, history, incomingText: event.text });
    ai.respuesta = cleanWhatsappAnswer(ai.respuesta);
    const updatedLead = await updateLeadFromAi(lead.id, ai);

    const iaConversation = await saveConversation({
      empresaId: empresa.id,
      leadId: lead.id,
      telefono: event.from,
      rol: ai.requiere_asesor ? 'sistema' : 'ia',
      mensaje: ai.respuesta,
      tipo: 'text',
      metadata: { ai, provider: 'evolution', instanceName: event.instanceName, requires_human: ai.requiere_asesor, from_me: true }
    });

    const evoResponse = await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: ai.respuesta });

    await saveWebhookLog({
      empresaId: empresa.id,
      leadId: lead.id,
      evento: 'evolution_message_processed',
      payload: { event, ai, evoResponse, updatedLeadId: updatedLead?.id, iaConversationId: iaConversation?.id },
      estado: 'ok'
    });

    return { ok: true, provider: 'evolution', telefono: event.from, lead_id: lead.id, respuesta: ai.respuesta, evolution: evoResponse };
  } catch (error) {
    console.error('[processEvolutionIncomingEvent]', error);
    await saveWebhookLog({
      empresaId: empresa?.id || null,
      leadId: lead?.id || null,
      evento: 'evolution_message_error',
      payload: { event, fullPayload },
      estado: 'error',
      error: error.message
    }).catch(() => null);
    return { ok: false, provider: 'evolution', telefono: event.from, error: error.message };
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
              contacts: [{ profile: { name: name || 'Cliente' }, wa_id: from }],
              messages: [
                {
                  from,
                  id: `wamid.manual.${Date.now()}`,
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

module.exports = { processWebhookPayload, processIncomingEvent, simulateIncomingMessage, processEvolutionWebhookPayload, processEvolutionIncomingEvent };
