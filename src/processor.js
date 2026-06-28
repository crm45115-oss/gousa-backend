const {
  getEmpresaByPhoneNumberId,
  getEmpresaByEvolutionInstance,
  getIaConfig,
  getKnowledge,
  upsertLead,
  saveConversation,
  getConversationHistory,
  updateLeadFromAi,
  upsertLiveFardoPedido,
  saveWebhookLog,
  saveMessageStatus,
  findConversationHeader,
  isRecentAiEcho,
  setConversationIaPaused,
  isConversationPaused
} = require('./db');
const { extractIncomingEvents, sendWhatsAppText, markMessageRead } = require('./whatsapp');
const { extractEvolutionMessages, sendEvolutionText, sendEvolutionImage, normalizeEvolutionEvent } = require('./evolution');
const { supabase } = require('./supabaseClient');
const { generateAiReply, cleanWhatsappAnswer } = require('./ai');


function isLikelyAutoGreetingText(text = '') {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!t.trim()) return false;
  const patterns = [
    'gracias por comunicarte',
    'te responderemos a la brevedad',
    'responderemos a la brevedad',
    'nos especializamos',
    'cuentanos que necesitas',
    'con gusto te ayudaremos',
    'bienvenido a fernando web',
    'fernando web studio',
    'diseno y desarrollo de paginas web',
    'marketing digital y gestion de redes',
    'posicionamiento en google'
  ];
  return patterns.some((x) => t.includes(x));
}

async function hasRecentAutoGreetingFromMe({ empresaId, telefono, seconds = 1800 }) {
  try {
    const since = new Date(Date.now() - seconds * 1000).toISOString();
    const { data, error } = await supabase
      .from('conversacion_mensajes')
      .select('mensaje,from_me,created_at')
      .eq('empresa_id', empresaId)
      .eq('telefono', telefono)
      .eq('from_me', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) return false;
    return (data || []).some((row) => isLikelyAutoGreetingText(row.mensaje));
  } catch (_) {
    return false;
  }
}

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
      getConversationHistory(lead.id, event.from, 18, empresa.id)
    ]);

    const ai = await generateAiReply({ empresa, iaConfig, knowledge, lead, history, incomingText: event.text });
    ai.respuesta = cleanWhatsappAnswer(ai.respuesta);
    const updatedLead = await updateLeadFromAi(lead.id, ai);
    await upsertLiveFardoPedido({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, aiData: ai, incomingText: event.text }).catch(() => null);

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


async function getQrPagoSeguro(empresaId, iaConfig = {}) {
  let qr = iaConfig?.qr_pago_url || iaConfig?.qr_img || iaConfig?.admin_config?.qr_pago_url || '';
  let texto = iaConfig?.qr_pago_texto || iaConfig?.qr_texto || 'QR de pago';
  if (qr) return { qr, texto };
  try {
    const { data } = await supabase
      .from('empresa_admin_config')
      .select('qr_pago_url,qr_pago_img,qr_pago_texto')
      .eq('empresa_id', empresaId)
      .maybeSingle();
    qr = data?.qr_pago_url || data?.qr_pago_img || '';
    texto = data?.qr_pago_texto || texto;
  } catch (_) {}
  return { qr, texto };
}

function pidioQrPago(texto = '') {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return t.includes('qr') || t.includes('q r') || t.includes('pago') || t.includes('pagar') ||
    t.includes('pagarte') || t.includes('transferencia') || t.includes('reserva') ||
    t.includes('reservar') || t.includes('mio') || t.includes('case') ||
    t.includes('anot') || t.includes('lo quiero') || t.includes('quiero esa');
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

      // WhatsApp Business puede devolver saludos/ausencias automáticas como fromMe=true.
      // Eso NO es una intervención humana y no debe pausar la IA.
      if (isLikelyAutoGreetingText(event.text)) {
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_from_me_auto_greeting_ignored', payload: event, estado: 'ok' });
        return { ok: true, skipped: true, reason: 'from_me_auto_greeting_ignored', telefono: event.from };
      }

      // V16.20 HOTFIX:
      // Evolution/WhatsApp puede devolver cualquier mensaje saliente como fromMe=true
      // (eco de IA, saludo automático o mensajes del teléfono). Para no matar la IA,
      // ya NO pausamos automáticamente por fromMe. La pausa real se hace con /ia off
      // o desde el panel del SaaS. Guardamos el evento como saliente y lo ignoramos.
      await saveConversation({
        empresaId: empresa.id,
        leadId: lead.id,
        telefono: event.from,
        rol: 'asesor',
        mensaje: event.text,
        tipo: event.type,
        waMessageId: event.waMessageId,
        metadata: { provider: 'evolution', evolution: event.rawMessage, instanceName: event.instanceName, contact_name: event.contactName, from_me: true, human_manual: false, ignored_from_me: true }
      }).catch(() => null);

      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_from_me_outgoing_ignored_no_pause', payload: event, estado: 'ok' });
      return { ok: true, skipped: true, reason: 'from_me_ignored_no_pause', telefono: event.from };
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
      const esPausaPorComando = motivo === 'comando_ia_off';
      const esPausaHumana = motivo === 'humano_respondio_desde_celular';
      const fueSaludoAutomatico = esPausaHumana && await hasRecentAutoGreetingFromMe({ empresaId: empresa.id, telefono: event.from });
      const esPausaReal = esPausaPorComando || (esPausaHumana && !fueSaludoAutomatico);
      if (!esPausaReal) {
        await setConversationIaPaused({ empresaId: empresa.id, telefono: event.from, paused: false });
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_auto_reactivate_false_pause', payload: { event, motivo, fueSaludoAutomatico }, estado: 'ok' });
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
      getConversationHistory(lead.id, event.from, 18, empresa.id)
    ]);

    const ai = await generateAiReply({ empresa, iaConfig, knowledge, lead, history, incomingText: event.text });
    ai.respuesta = cleanWhatsappAnswer(ai.respuesta);
    const updatedLead = await updateLeadFromAi(lead.id, ai);
    await upsertLiveFardoPedido({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, aiData: ai, incomingText: event.text }).catch(() => null);

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

    let evoQrResponse = null;
    const pidioQR = pidioQrPago(event.text);
    const qrCfg = await getQrPagoSeguro(empresa.id, iaConfig);
    if ((ai.enviar_qr || pidioQR) && qrCfg.qr) {
      evoQrResponse = await sendEvolutionImage({
        instanceName: integration.instance_name || event.instanceName,
        to: event.from,
        image: qrCfg.qr,
        caption: qrCfg.texto || 'QR de pago'
      }).catch((e) => ({ error: e.message }));
      if (evoQrResponse?.error) {
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_error', payload: { error: evoQrResponse.error, hasQr: Boolean(qrCfg.qr) }, estado: 'error', error: evoQrResponse.error }).catch(() => null);
      } else {
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_sent', payload: { telefono: event.from }, estado: 'ok' }).catch(() => null);
      }
    } else if ((ai.enviar_qr || pidioQR) && !qrCfg.qr) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_requested_but_not_configured', payload: { texto: event.text }, estado: 'error', error: 'QR no configurado en empresa_admin_config.qr_pago_url' }).catch(() => null);
    }

    await saveWebhookLog({
      empresaId: empresa.id,
      leadId: lead.id,
      evento: 'evolution_message_processed',
      payload: { event, ai, evoResponse, evoQrResponse, updatedLeadId: updatedLead?.id, iaConversationId: iaConversation?.id },
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
