const { supabase } = require('./supabaseClient');
const { config } = require('./env');
const { onlyDigits, nowIso } = require('./utils');

async function getEmpresaByPhoneNumberId(phoneNumberId = '') {
  if (phoneNumberId) {
    // V15 multiempresa: primero busca la integración del cliente.
    const { data: integration, error: integrationError } = await supabase
      .from('whatsapp_integraciones')
      .select('*, empresas(*)')
      .eq('phone_number_id', phoneNumberId)
      .in('estado', ['conectado', 'pendiente'])
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
    .in('estado', ['conectado', 'pendiente'])
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
    const { data, error } = await supabase
      .from('leads')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      ...payload,
      estado: cleanUpdates.estado || 'nuevo',
      etapa: cleanUpdates.etapa || 'lead_nuevo',
      origen: 'whatsapp'
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function normalizeLeadUpdates(updates = {}) {
  const allowed = [
    'nombre_completo', 'motivo_viaje', 'tuvo_visa', 'visa_negada', 'visa_revocada',
    'infraccion_migratoria', 'ciudad_origen', 'pais_origen', 'destino', 'fecha_viaje',
    'numero_personas', 'presupuesto', 'pasaporte_vigente', 'necesita_visa',
    'cotiza_pasajes', 'hotel_incluido', 'seguro_viaje', 'servicio_solicitado',
    'comentarios', 'estado', 'prioridad', 'etapa', 'requiere_asesor', 'fuera_horario',
    'bloqueado', 'etiquetas'
  ];
  const out = {};
  for (const key of allowed) {
    if (updates[key] !== undefined && updates[key] !== null && updates[key] !== '') {
      out[key] = updates[key];
    }
  }
  if (out.numero_personas !== undefined) out.numero_personas = Number(out.numero_personas) || null;
  if (out.presupuesto !== undefined) out.presupuesto = Number(out.presupuesto) || null;
  if (typeof out.necesita_visa === 'string') out.necesita_visa = ['si', 'sí', 'true', '1'].includes(out.necesita_visa.toLowerCase());
  if (typeof out.cotiza_pasajes === 'string') out.cotiza_pasajes = ['si', 'sí', 'true', '1'].includes(out.cotiza_pasajes.toLowerCase());
  if (typeof out.hotel_incluido === 'string') out.hotel_incluido = ['si', 'sí', 'true', '1'].includes(out.hotel_incluido.toLowerCase());
  if (typeof out.seguro_viaje === 'string') out.seguro_viaje = ['si', 'sí', 'true', '1'].includes(out.seguro_viaje.toLowerCase());
  return out;
}

async function saveConversation({ empresaId, leadId, telefono, rol, mensaje, tipo = 'text', waMessageId = null, metadata = {} }) {
  const { data, error } = await supabase
    .from('conversaciones')
    .insert({
      empresa_id: empresaId,
      lead_id: leadId || null,
      telefono: onlyDigits(telefono),
      wa_message_id: waMessageId,
      rol,
      mensaje,
      tipo,
      metadata
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function getConversationHistory(leadId, telefono, limit = 16) {
  let query = supabase
    .from('conversaciones')
    .select('rol,mensaje,tipo,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (leadId) query = query.eq('lead_id', leadId);
  else query = query.eq('telefono', onlyDigits(telefono));

  const { data, error } = await query;
  if (error) console.error('[getConversationHistory]', error.message);
  return (data || []).reverse();
}

async function updateLeadFromAi(leadId, aiData = {}) {
  const updates = normalizeLeadUpdates(aiData.lead_updates || aiData.lead || {});
  if (aiData.requiere_asesor === true) updates.requiere_asesor = true;
  if (aiData.derivar === true) updates.requiere_asesor = true;
  if (!Object.keys(updates).length) return null;
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: nowIso() })
    .eq('id', leadId)
    .select('*')
    .single();
  if (error) {
    console.error('[updateLeadFromAi]', error.message);
    return null;
  }
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
  saveMessageStatus
};
