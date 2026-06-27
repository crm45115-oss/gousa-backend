const { supabase } = require('./supabaseClient');
const { config } = require('./env');
const { onlyDigits, nowIso } = require('./utils');

async function getEmpresaByPhoneNumberId(phoneNumberId = '') {
  if (phoneNumberId) {
    const { data: integration, error: integrationError } = await supabase
      .from('whatsapp_integraciones')
      .select('*, empresas(*)')
      .eq('phone_number_id', phoneNumberId)
      .in('estado', ['conectado', 'pendiente', 'qr_pendiente'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (integrationError) console.error('[getIntegrationByPhoneNumberId]', integrationError.message);
    if (integration?.empresas?.activo) return integration.empresas;

    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .eq('activo', true)
      .maybeSingle();
    if (error) console.error('[getEmpresaByPhoneNumberId]', error.message);
    if (data) return data;
  }

  if (config.defaultEmpresaId) {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', config.defaultEmpresaId)
      .maybeSingle();
    if (error) console.error('[getEmpresa DEFAULT]', error.message);
    if (data) return data;
  }

  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('activo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No existe empresa activa en Supabase. Ejecuta el SQL primero.');
  return data;
}

async function getWhatsAppIntegrationByPhoneNumberId(phoneNumberId = '') {
  if (!phoneNumberId) return null;
  const { data, error } = await supabase
    .from('whatsapp_integraciones')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .in('estado', ['conectado', 'pendiente', 'qr_pendiente'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error('[getWhatsAppIntegrationByPhoneNumberId]', error.message);
  return data || null;
}

async function getEmpresaByEvolutionInstance(instanceName = '') {
  const clean = String(instanceName || '').trim();
  if (!clean) throw new Error('Falta instanceName de Evolution.');
  const { data, error } = await supabase
    .from('whatsapp_integraciones')
    .select('*, empresas(*)')
    .or(`instance_name.eq.${clean},phone_number_id.eq.${clean}`)
    .in('estado', ['conectado', 'pendiente', 'qr_pendiente'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error('[getEmpresaByEvolutionInstance]', error.message);
  if (data?.empresas) return { empresa: data.empresas, integration: data };
  throw new Error(`No existe empresa para instancia Evolution: ${clean}`);
}

async function getIaConfig(empresaId) {
  const { data, error } = await supabase
    .from('ia_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error('[getIaConfig]', error.message);
  return data || {};
}

async function getKnowledge(empresaId) {
  const [servicios, fuentes, faqs, plantillas] = await Promise.all([
    supabase.from('servicios').select('*').eq('empresa_id', empresaId).eq('activo', true).limit(50),
    supabase.from('knowledge_sources').select('*').eq('activo', true).order('prioridad', { ascending: true }).limit(50),
    supabase.from('faq_ia').select('*').eq('activo', true).limit(30),
    supabase.from('plantillas_respuesta').select('*').eq('empresa_id', empresaId).eq('activo', true).limit(30)
  ]);
  return {
    servicios: servicios.data || [],
    fuentes: fuentes.data || [],
    faqs: faqs.data || [],
    plantillas: plantillas.data || []
  };
}

async function findLead(empresaId, telefono) {
  const phone = onlyDigits(telefono);
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('empresa_id', empresaId)
    .or(`telefono.eq.${phone},wa_id.eq.${phone}`)
    .maybeSingle();
  if (error) console.error('[findLead]', error.message);
  return data || null;
}

async function upsertLead({ empresaId, telefono, waId, nombreWhatsapp, incomingText, leadUpdates = {} }) {
  const phone = onlyDigits(telefono || waId);
  const existing = await findLead(empresaId, phone);
  const cleanUpdates = normalizeLeadUpdates(leadUpdates);
  const payload = {
    empresa_id: empresaId,
    telefono: phone,
    wa_id: onlyDigits(waId || phone),
    nombre_whatsapp: nombreWhatsapp || existing?.nombre_whatsapp || null,
    ultimo_mensaje: incomingText || existing?.ultimo_mensaje || null,
    ultima_interaccion: nowIso(),
    updated_at: nowIso(),
    ...cleanUpdates
  };

  if (existing) {
    const { data, error } = await supabase.from('leads').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from('leads').insert({
    ...payload,
    estado: cleanUpdates.estado || 'nuevo',
    etapa: cleanUpdates.etapa || 'lead_nuevo',
    origen: 'whatsapp'
  }).select('*').single();
  if (error) throw error;
  return data;
}

function normalizeLeadUpdates(updates = {}) {
  const allowed = [
    'nombre_completo','motivo_viaje','tuvo_visa','visa_negada','visa_revocada',
    'infraccion_migratoria','ciudad_origen','pais_origen','destino','fecha_viaje',
    'numero_personas','presupuesto','pasaporte_vigente','necesita_visa',
    'cotiza_pasajes','hotel_incluido','seguro_viaje','servicio_solicitado',
    'comentarios','estado','prioridad','etapa','requiere_asesor','fuera_horario',
    'bloqueado','etiquetas'
  ];
  const out = {};
  for (const key of allowed) {
    if (updates[key] !== undefined && updates[key] !== null && updates[key] !== '') out[key] = updates[key];
  }
  if (out.numero_personas !== undefined) out.numero_personas = Number(out.numero_personas) || null;
  if (out.presupuesto !== undefined) out.presupuesto = Number(out.presupuesto) || null;
  for (const b of ['necesita_visa','cotiza_pasajes','hotel_incluido','seguro_viaje']) {
    if (typeof out[b] === 'string') out[b] = ['si','sí','true','1'].includes(out[b].toLowerCase());
  }
  return out;
}

async function findConversationHeader({ empresaId, telefono, instanceName = '' }) {
  const phone = onlyDigits(telefono);
  let q = supabase
    .from('conversaciones')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('telefono', phone)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) console.error('[findConversationHeader]', error.message);
  return data || null;
}

async function upsertConversationHeader({ empresaId, leadId, telefono, mensaje, provider = 'evolution', instanceName = '', fromMe = false, rol = 'cliente', metadata = {} }) {
  const phone = onlyDigits(telefono);
  const existing = await findConversationHeader({ empresaId, telefono: phone, instanceName });
  const now = nowIso();
  const patch = {
    empresa_id: empresaId,
    lead_id: leadId || existing?.lead_id || null,
    telefono: phone,
    ultimo_mensaje: mensaje || existing?.ultimo_mensaje || null,
    estado: existing?.estado || 'abierta',
    canal: provider === 'evolution' ? 'evolution' : 'meta',
    provider,
    instance_name: instanceName || existing?.instance_name || null,
    updated_at: now
  };

  if (!fromMe && rol === 'cliente') patch.unread_count = (Number(existing?.unread_count || 0) + 1);

  if (existing) {
    const { data, error } = await supabase.from('conversaciones').update(patch).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from('conversaciones').insert({
    ...patch,
    ia_pausada: false,
    unread_count: !fromMe && rol === 'cliente' ? 1 : 0,
    created_at: now,
    // columnas antiguas, por compatibilidad si existen
    rol,
    mensaje,
    tipo: metadata?.tipo || 'text',
    metadata
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function saveConversation({ empresaId, leadId, telefono, rol, mensaje, tipo = 'text', waMessageId = null, metadata = {} }) {
  const provider = metadata?.provider || (metadata?.evolution || metadata?.instanceName ? 'evolution' : 'meta');
  const instanceName = metadata?.instanceName || metadata?.evolution?.instanceName || metadata?.evolution?.instance || null;
  const fromMe = Boolean(metadata?.from_me || metadata?.fromMe || rol === 'asesor' || rol === 'ia' || rol === 'sistema');
  const phone = onlyDigits(telefono);

  const conversation = await upsertConversationHeader({
    empresaId, leadId, telefono: phone, mensaje, provider, instanceName, fromMe, rol, metadata: { ...metadata, tipo }
  });

  const direccion = rol === 'cliente' && !fromMe ? 'entrante' : 'saliente';
  const msgPayload = {
    empresa_id: empresaId,
    conversacion_id: conversation.id,
    telefono: phone,
    direccion,
    from_me: fromMe,
    origen: provider,
    tipo,
    mensaje,
    payload: { waMessageId, rol, metadata }
  };

  const { data: messageRow, error: msgError } = await supabase.from('conversacion_mensajes').insert(msgPayload).select('*').single();
  if (msgError) {
    // No bloquear la IA si la tabla de mensajes aún no existe. Log y continuar.
    console.error('[saveConversation conversacion_mensajes]', msgError.message);
  }

  return { ...conversation, message_id: messageRow?.id || null };
}

async function setConversationIaPaused({ empresaId, telefono, paused = true, motivo = 'asesor_manual', pausaHasta = null }) {
  const phone = onlyDigits(telefono);
  const existing = await findConversationHeader({ empresaId, telefono: phone });
  if (!existing) return null;
  const { data, error } = await supabase.from('conversaciones').update({
    ia_pausada: paused,
    pausa_motivo: paused ? motivo : null,
    pausa_hasta: paused ? pausaHasta : null,
    unread_count: paused ? existing.unread_count : 0,
    updated_at: nowIso()
  }).eq('id', existing.id).select('*').single();
  if (error) throw error;
  return data;
}

async function isConversationPaused({ empresaId, telefono }) {
  const conv = await findConversationHeader({ empresaId, telefono });
  if (!conv) return false;
  if (!conv.ia_pausada) return false;
  if (conv.pausa_hasta && new Date(conv.pausa_hasta).getTime() < Date.now()) {
    await setConversationIaPaused({ empresaId, telefono, paused: false, motivo: null }).catch(() => null);
    return false;
  }
  return true;
}

async function getConversationHistory(leadId, telefono, limit = 16) {
  const phone = onlyDigits(telefono);
  const { data: msgRows, error: msgError } = await supabase
    .from('conversacion_mensajes')
    .select('direccion,mensaje,tipo,created_at,from_me')
    .eq('telefono', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!msgError && Array.isArray(msgRows) && msgRows.length) {
    return msgRows.reverse().map((m) => ({
      rol: m.direccion === 'entrante' ? 'cliente' : (m.from_me ? 'asesor' : 'ia'),
      mensaje: m.mensaje,
      tipo: m.tipo,
      created_at: m.created_at
    }));
  }

  let query = supabase.from('conversaciones').select('rol,mensaje,tipo,created_at').order('created_at', { ascending: false }).limit(limit);
  if (leadId) query = query.eq('lead_id', leadId); else query = query.eq('telefono', phone);
  const { data, error } = await query;
  if (error) console.error('[getConversationHistory]', error.message);
  return (data || []).reverse();
}

async function updateLeadFromAi(leadId, aiData = {}) {
  const updates = normalizeLeadUpdates(aiData.lead_updates || aiData.lead || {});
  if (aiData.requiere_asesor === true) updates.requiere_asesor = true;
  if (aiData.derivar === true) updates.requiere_asesor = true;
  if (!Object.keys(updates).length) return null;
  const { data, error } = await supabase.from('leads').update({ ...updates, updated_at: nowIso() }).eq('id', leadId).select('*').single();
  if (error) { console.error('[updateLeadFromAi]', error.message); return null; }
  return data;
}

async function saveWebhookLog({ empresaId = null, leadId = null, evento, payload = {}, estado = 'ok', error = null }) {
  const base = { empresa_id: empresaId, lead_id: leadId, evento, payload, estado, error };
  const { error: errWebhook } = await supabase.from('webhook_logs').insert(base);
  if (!errWebhook) return;
  const { error: errOld } = await supabase.from('n8n_logs').insert({ ...base, workflow: 'webhook_meta' });
  if (errOld) console.error('[saveWebhookLog]', errWebhook.message, errOld.message);
}

async function saveMessageStatus({ empresaId, payload }) {
  const statuses = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const status of change.value?.statuses || []) {
        statuses.push({
          empresa_id: empresaId || null,
          wa_message_id: status.id,
          telefono: onlyDigits(status.recipient_id || ''),
          estado: status.status,
          timestamp_meta: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : null,
          payload: status
        });
      }
    }
  }
  if (!statuses.length) return;
  const { error } = await supabase.from('message_statuses').upsert(statuses, { onConflict: 'wa_message_id,estado' });
  if (error) console.error('[saveMessageStatus]', error.message);
}

module.exports = {
  getEmpresaByPhoneNumberId,
  getWhatsAppIntegrationByPhoneNumberId,
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
  setConversationIaPaused,
  isConversationPaused
};
