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
const { onlyDigits } = require('./utils');

function cleanOutgoingText(text = '') {
  return cleanWhatsappAnswer(String(text || ''))
    .replace(/^\s*\{\s*$/,'')
    .replace(/^\s*[\}\]]\s*$/,'')
    .trim();
}


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
    ai.respuesta = cleanOutgoingText(ai.respuesta);
    // Si ya existe contexto, evita saludos repetidos en American Style.
    const statePost = await getConversationStateLocal({ empresaId: empresa.id, telefono: event.from });
    if (isAmericanStyle(empresa, iaConfig) && statePost?.estado && statePost.estado !== 'inicio') {
      ai.respuesta = String(ai.respuesta || '').replace(/^\s*(¡?hola[^.!?]*[.!?]\s*)/i, '').trim() || ai.respuesta;
    }
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
  let qr =
    iaConfig?.qr_pago_url ||
    iaConfig?.qr_imagen_url ||
    iaConfig?.qr_img ||
    iaConfig?.admin_config?.qr_pago_url ||
    iaConfig?.admin_config?.qr_imagen_url ||
    iaConfig?.admin_config?.qr_pago_img ||
    '';

  let texto =
    iaConfig?.qr_pago_texto ||
    iaConfig?.texto_qr ||
    iaConfig?.qr_texto ||
    iaConfig?.admin_config?.qr_pago_texto ||
    iaConfig?.live_config?.texto_qr ||
    'Te paso el QR bella 😊 Cuando hagas el pago, envíame el comprobante para que el equipo lo revise.';

  if (qr) return { qr, texto, source: 'ia_config_admin' };

  // V16.23: el panel Formas de pago guarda el QR en empresa_admin_config.qr_pago_url.
  // Esta tabla es la fuente principal para evitar duplicar el QR en live_fardo_config.
  try {
    const { data, error } = await supabase
      .from('empresa_admin_config')
      .select('*')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (!error && data) {
      qr = data.qr_pago_url || data.qr_imagen_url || data.qr_pago_img || data.qr_url || data.imagen_qr || '';
      texto = data.qr_pago_texto || data.texto_qr || texto;
      if (qr) return { qr, texto, source: 'empresa_admin_config.qr_pago_url' };
    }
  } catch (e) {
    await saveWebhookLog({ empresaId, evento: 'qr_empresa_admin_config_read_error', payload: {}, estado: 'error', error: e.message }).catch(() => null);
  }

  // Respaldo para versiones que guardan QR en live_fardo_config.
  try {
    const { data, error } = await supabase
      .from('live_fardo_config')
      .select('*')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (!error && data) {
      qr = data.qr_imagen_url || data.qr_pago_url || data.qr_url || data.imagen_qr || data.qr_storage_path || '';
      texto = data.texto_qr || data.mensaje_comprobante || texto;
      if (qr) return { qr, texto, source: 'live_fardo_config' };
    }
  } catch (e) {
    await saveWebhookLog({ empresaId, evento: 'qr_live_fardo_config_read_error', payload: {}, estado: 'error', error: e.message }).catch(() => null);
  }

  return { qr: '', texto, source: 'not_configured' };
}

function pidioQrPago(texto = '') {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return t.includes('qr') || t.includes('q r') || t.includes('pago') || t.includes('pagar') ||
    t.includes('pagarte') || t.includes('transferencia') || t.includes('reserva') ||
    t.includes('reservar') || t.includes('mio') || t.includes('case') ||
    t.includes('anot') || t.includes('lo quiero') || t.includes('quiero esa');
}

function normalizeTextBasic(texto = '') {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function esComprobanteTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  return t.includes('comprobante') || t.includes('pague') || t.includes('pagado') ||
    t.includes('transferi') || t.includes('deposito') || t.includes('depósito') ||
    t.includes('recibo') || t.includes('voucher') || t.includes('captura de pago');
}

function esImagenSinTextoClaro(event) {
  return esEventoMedia(event) && !textoClaroEvento(event?.text || '');
}

function esOtraPlazaNoTrompillo(texto = '') {
  const t = normalizeTextBasic(texto);
  return t.includes('plaza') && !t.includes('trompillo');
}

function esDeliveryTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  // V16.29: si menciona otra plaza distinta a Plaza El Trompillo, NO es recojo Trompillo.
  // Se trata como delivery/ubicación a coordinar.
  if (esOtraPlazaNoTrompillo(t)) return true;
  return t.includes('delivery') || t.includes('delibery') || t.includes('yango') ||
    t.includes('mandamelo') || t.includes('mándamelo') || t.includes('envien') || t.includes('envies') || t.includes('enviame') ||
    t.includes('envien por') || t.includes('envies por') || t.includes('enviar por') || t.includes('envio por') || t.includes('envío por') ||
    t.includes('enviamelo') || t.includes('envíamelo') || t.includes('me lo envien') || t.includes('me lo envíen') ||
    t.includes('me lo mandan') || t.includes('mandar a') || t.includes('llevar a') || t.includes('llevamelo') ||
    t.includes('llévalo') || t.includes('a domicilio') || t.includes('quiero envio a') || t.includes('quiero envío a');
}

function esDepartamentoTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  return t.includes('departamento') || t.includes('provincia') || t.includes('transportadora') ||
    t.includes('flota') || t.includes('encomienda') || t.includes('terminal') ||
    t.includes('a sucre') || t.includes('a la paz') || t.includes('a cochabamba') ||
    t.includes('a beni') || t.includes('a oruro') || t.includes('a potosi') ||
    t.includes('a tarija') || t.includes('a pando');
}

function esRecojoTrompilloTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  if (esOtraPlazaNoTrompillo(t)) return false;
  // Solo Trompillo cuando lo piden claro. No usar cualquier palabra “plaza”.
  return t.includes('trompillo') ||
    t.includes('punto de recojo') ||
    t.includes('recojo del lunes') ||
    t.includes('entrega del live') ||
    t.includes('entrega lunes') ||
    t.includes('entregas del lunes') ||
    t.includes('paso a recoger') ||
    t.includes('voy a recoger') ||
    t.includes('agendar') || t.includes('agendarme') ||
    t.includes('anotame para recoger') || t.includes('anótame para recoger');
}


function extraerCiudadDepartamentoTexto(texto = '') {
  const raw = String(texto || '');
  const t = normalizeTextBasic(raw);
  const deps = ['santa cruz','la paz','cochabamba','oruro','potosi','potosí','chuquisaca','sucre','tarija','beni','pando'];
  const found = deps.find(d => t.includes(normalizeTextBasic(d)));
  const transportes = ['trans copacabana','copacabana','trans bolivar','bolivar','trans 6 de octubre','6 de octubre','flota','encomienda','transportadora','terminal','expreso'];
  const trans = transportes.find(d => t.includes(normalizeTextBasic(d)));
  return { departamento: found || '', transportadora: trans || '' };
}

async function registrarTipoEntregaLocal({ empresa, lead, event, tipo, estado, incomingText = '', extra = {} }) {
  const text = incomingText || event?.text || '';
  const update = {
    tipo_entrega: tipo,
    estado_entrega: estado || 'pendiente_revision',
    ultimo_mensaje: text,
    ...extra
  };
  await updateLeadFromAi(lead.id, { lead_updates: update }).catch(() => null);
  return upsertLiveFardoPedido({
    empresaId: empresa.id,
    leadId: lead.id,
    telefono: event.from,
    aiData: {
      lead_updates: update,
      regla_local: 'registrar_entrega_local'
    },
    incomingText: text
  }).catch(() => null);
}

async function registrarDatosDeliveryLocal({ empresa, lead, event, tipo = 'delivery_normal' }) {
  const text = String(event?.text || '').trim();
  const extra = {
    direccion_entrega: text,
    ubicacion_entrega: /https?:\/\//i.test(text) || normalizeTextBasic(text).includes('maps') ? text : null
  };
  return registrarTipoEntregaLocal({ empresa, lead, event, tipo, estado: 'datos_recibidos_delivery', incomingText: text, extra });
}

async function registrarDatosDepartamentoLocal({ empresa, lead, event, iaConfig = {} }) {
  const text = String(event?.text || '').trim();
  const extraído = extraerCiudadDepartamentoTexto(text);
  const extra = {
    direccion_entrega: text,
    ciudad_destino: extraído.departamento || null,
    departamento_destino: extraído.departamento || null,
    transportadora: extraído.transportadora || null,
    costo_despacho_transportadora: iaConfig?.costo_despacho_transportadora || 5
  };
  return registrarTipoEntregaLocal({ empresa, lead, event, tipo: 'departamento_provincia', estado: 'datos_recibidos_departamento', incomingText: text, extra });
}

function esMasTardeTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  return t.includes('mas tarde') || t.includes('más tarde') || t.includes('luego pago') ||
    t.includes('despues pago') || t.includes('después pago') || t.includes('te cancelo mas tarde') ||
    t.includes('te cancelo más tarde') || t.includes('te pago luego') || t.includes('te aviso');
}

function isAmericanStyle(empresa = {}, iaConfig = {}) {
  const txt = `${empresa?.rubro || ''} ${empresa?.nombre || ''} ${empresa?.nombre_comercial || ''} ${iaConfig?.nombre_comercial || ''}`.toLowerCase();
  return txt.includes('american') || txt.includes('live_fardo') || txt.includes('venta_live_fardo') || txt.includes('fardo');
}

async function getConversationStateLocal({ empresaId, telefono }) {
  const phone = onlyDigits(telefono);
  try {
    const { data, error } = await supabase
      .from('conversation_state')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('telefono', phone)
      .maybeSingle();
    if (!error && data) return data;
  } catch (_) {}

  // Respaldo si no se corrió SQL: infiere desde los últimos mensajes guardados.
  try {
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('conversacion_mensajes')
      .select('mensaje,tipo,payload,created_at,from_me')
      .eq('empresa_id', empresaId)
      .eq('telefono', phone)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(25);
    const rows = data || [];
    for (const r of rows) {
      const regla = r?.payload?.metadata?.regla_local || r?.payload?.metadata?.ai?.regla_local || '';
      const msg = normalizeTextBasic(r.mensaje || '');
      if (regla === 'delivery_datos' || regla === 'delivery_plaza_datos' || msg.includes('direccion exacta')) return { estado: 'esperando_datos_delivery', metadata: { reglaLocal: regla } };
      if (regla === 'departamento_datos' || msg.includes('transportadora')) return { estado: 'esperando_datos_departamento', metadata: {} };
      if (regla === 'comprobante_recibido' || msg.includes('recibimos tu comprobante')) return { estado: 'comprobante_recibido', metadata: {} };
      if (regla === 'qr_directo' || msg.includes('envíame el comprobante') || msg.includes('enviame el comprobante')) return { estado: 'qr_enviado', metadata: {} };
    }
  } catch (_) {}
  return { estado: 'inicio', metadata: {} };
}

async function setConversationStateLocal({ empresaId, leadId, telefono, estado, metadata = {} }) {
  const phone = onlyDigits(telefono);
  try {
    const payload = {
      empresa_id: empresaId,
      lead_id: leadId || null,
      telefono: phone,
      estado,
      metadata,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from('conversation_state')
      .upsert(payload, { onConflict: 'empresa_id,telefono' });
    if (error) throw error;
  } catch (e) {
    await saveWebhookLog({ empresaId, leadId, evento: 'conversation_state_upsert_error', payload: { telefono: phone, estado }, estado: 'error', error: e.message }).catch(() => null);
  }
}

async function responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal, estadoNuevo = null }) {
  respuesta = cleanOutgoingText(respuesta);
  if (estadoNuevo) await setConversationStateLocal({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, estado: estadoNuevo, metadata: { reglaLocal } });
  await saveConversation({
    empresaId: empresa.id,
    leadId: lead.id,
    telefono: event.from,
    rol: 'ia',
    mensaje: respuesta,
    tipo: 'text',
    metadata: { provider: 'evolution', regla_local: reglaLocal, from_me: true }
  }).catch(() => null);
  const evoResponse = await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: respuesta });
  await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: `evolution_${reglaLocal}`, payload: { telefono: event.from }, estado: 'ok' }).catch(() => null);
  return { ok: true, provider: 'evolution', telefono: event.from, lead_id: lead.id, respuesta, evolution: evoResponse };
}

async function responderDeliveryEvolution({ empresa, lead, event, integration }) {
  const t = normalizeTextBasic(event?.text || '');
  const mencionaOtraPlaza = esOtraPlazaNoTrompillo(t);
  const tipoEntrega = mencionaOtraPlaza ? 'delivery_plaza' : 'delivery_normal';
  await registrarTipoEntregaLocal({
    empresa,
    lead,
    event,
    tipo: tipoEntrega,
    estado: 'pendiente_datos_delivery',
    incomingText: event?.text || '',
    extra: { direccion_entrega: mencionaOtraPlaza ? event?.text : null }
  });
  const intro = mencionaOtraPlaza
    ? 'Claro bella 😊 podemos enviártelo por delivery a esa plaza o ubicación. Para no confundirlo con Plaza El Trompillo, te pido que me mandes la ubicación exacta, zona y referencia.'
    : 'Claro bella 😊 Para enviarte tu prenda por delivery, pásame por favor:';
  const respuesta = `${intro}

• Nombre completo
• Dirección exacta
• Zona o barrio
• Referencia
• Ubicación si puedes enviarla

Apenas el equipo revise tu pago, coordinamos tu envío por aquí. 💜`;
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: tipoEntrega === 'delivery_plaza' ? 'delivery_plaza_datos' : 'delivery_datos', estadoNuevo: 'esperando_datos_delivery' });
}

async function responderDepartamentoEvolution({ empresa, lead, event, integration, iaConfig = {} }) {
  const costo = iaConfig?.costo_despacho_transportadora || 5;
  await registrarTipoEntregaLocal({
    empresa,
    lead,
    event,
    tipo: 'departamento_provincia',
    estado: 'pendiente_datos_envio',
    incomingText: event?.text || '',
    extra: { costo_despacho_transportadora: costo }
  });
  const respuesta = `Claro bella 😊 hacemos envíos a departamentos y provincias. Para registrarte tu envío, pásame por favor:

• Nombre completo
• Ciudad/departamento
• Celular
• Transportadora que prefieres

Se cobra ${costo} Bs aparte por llevar tus prendas a la transportadora, más lo que cobre la transportadora por el envío. 💜`;
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'departamento_datos', estadoNuevo: 'esperando_datos_departamento' });
}

async function responderRecojoTrompilloEvolution({ empresa, lead, event, integration, iaConfig = {} }) {
  const horario = iaConfig?.horario_recojo || iaConfig?.reglas_entrega || 'lunes de 4:00 p. m. a 5:00 p. m. en la Plaza El Trompillo';
  const puntoRosa = iaConfig?.punto_rosa || iaConfig?.punto_rosa_info || 'Punto Rosa';
  await registrarTipoEntregaLocal({ empresa, lead, event, tipo: 'recojo_trompillo', estado: 'pendiente_recojo', incomingText: event?.text || '', extra: { punto_entrega: 'Plaza El Trompillo' } });
  const respuesta = `Claro bella 😊 te espero el ${horario} para entregarte tu pedido.

Si por algún motivo no logras llegar ese día, no te preocupes: tus prendas podrán quedar para recojo en ${puntoRosa}, coordinando previamente por este WhatsApp. 💜`;
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'recojo_trompillo', estadoNuevo: 'entrega_trompillo' });
}

async function responderMasTardeEvolution({ empresa, lead, event, integration, state }) {
  const estado = state?.estado || 'inicio';
  const esAntigua = !['inicio', 'saludo'].includes(estado);
  const respuesta = esAntigua
    ? 'Perfecto bella 💜, tu prenda queda registrada.'
    : 'Perfecto bella 😊. Para asegurar la prenda durante el live, te encargamos confirmar el pago dentro de 5 minutos o cada 3 prendas, así no pasa a otra clienta. Gracias por comprender 💜';
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'mas_tarde', estadoNuevo: estado || 'inicio' });
}

async function usuarioEstaConfirmandoQr({ empresaId, telefono, texto }) {
  const t = normalizeTextBasic(texto);
  const afirmativo = ['si','sí','si porfa','si por favor','dale','ok','okay','ya','claro','mandame','mándame','pasame','pásame'].some(x => t === normalizeTextBasic(x) || t.includes(normalizeTextBasic(x)));
  if (!afirmativo) return false;
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('conversacion_mensajes')
      .select('mensaje,from_me,created_at')
      .eq('empresa_id', empresaId)
      .eq('telefono', telefono)
      .eq('from_me', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    return (data || []).some(r => normalizeTextBasic(r.mensaje).includes('quieres que te envie el qr') || normalizeTextBasic(r.mensaje).includes('te envio el qr') || normalizeTextBasic(r.mensaje).includes('qr para pagar'));
  } catch (_) {
    return false;
  }
}

async function responderComprobanteEvolution({ empresa, lead, event, integration }) {
  const respuesta = cleanOutgoingText('Gracias bella 😊 recibimos tu comprobante. El equipo revisará el pago y te confirmará tu pedido.');
  await setConversationStateLocal({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, estado: 'comprobante_recibido', metadata: { reglaLocal: 'comprobante_recibido' } });
  await saveConversation({
    empresaId: empresa.id,
    leadId: lead.id,
    telefono: event.from,
    rol: 'ia',
    mensaje: respuesta,
    tipo: 'text',
    metadata: { provider: 'evolution', regla_local: 'comprobante_recibido', from_me: true }
  }).catch(() => null);
  const evoResponse = await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: respuesta });
  await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_comprobante_respuesta_local', payload: { telefono: event.from }, estado: 'ok' }).catch(() => null);
  return { ok: true, provider: 'evolution', telefono: event.from, lead_id: lead.id, respuesta, evolution: evoResponse };
}


async function responderRegistroInicialEvolution({ empresa, lead, event, integration }) {
  const respuesta = `Hola bella 😊 bienvenida a American Style. Para registrarte bien tu pedido, envíame por favor:

• Tu nombre completo
• Tu alias de TikTok con el que comentas en el Live

Después mándame la captura de la prenda para apartarla correctamente. 💜`;
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'registro_inicial_live', estadoNuevo: 'esperando_datos_iniciales' });
}

async function responderPedirCapturaEvolution({ empresa, lead, event, integration }) {
  const respuesta = 'Perfecto bella 😊 ahora mándame la captura de la prenda para registrarla correctamente. Trabajamos con captura para evitar confusiones durante el Live. 💜';
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'pedir_captura_prenda', estadoNuevo: 'esperando_captura_prenda' });
}

async function responderCapturaPrendaEvolution({ empresa, lead, event, integration, iaConfig = {} }) {
  const qrCfg = await getQrPagoSeguro(empresa.id, iaConfig);
  const respuestaTexto = cleanOutgoingText(qrCfg.qr
    ? 'Perfecto bella 😊 recibí la captura de tu prenda. Te paso el QR para reservarla. Cuando hagas el pago, envíame el comprobante por aquí para que el equipo lo revise.'
    : 'Perfecto bella 😊 recibí la captura de tu prenda. Aún no está configurado el QR de esta tienda, el equipo te ayudará por aquí.');

  let evoQrResponse = null;
  if (qrCfg.qr) {
    try {
      evoQrResponse = await sendEvolutionImage({
        instanceName: integration.instance_name || event.instanceName,
        to: event.from,
        image: qrCfg.qr,
        caption: respuestaTexto
      });
    } catch (e) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_error_after_capture', payload: { telefono: event.from, qrSource: qrCfg.source }, estado: 'error', error: e.message }).catch(() => null);
      await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: respuestaTexto }).catch(() => null);
    }
  } else {
    await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: respuestaTexto }).catch(() => null);
  }

  await saveConversation({
    empresaId: empresa.id,
    leadId: lead.id,
    telefono: event.from,
    rol: 'ia',
    mensaje: respuestaTexto,
    tipo: qrCfg.qr ? 'image' : 'text',
    metadata: { provider: 'evolution', regla_local: 'captura_prenda_qr', from_me: true, qr_enviado: Boolean(qrCfg.qr), qrSource: qrCfg.source }
  }).catch(() => null);
  await setConversationStateLocal({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, estado: 'qr_enviado', metadata: { reglaLocal: 'captura_prenda_qr', qr_enviado: Boolean(qrCfg.qr), qrSource: qrCfg.source } });
  await upsertLiveFardoPedido({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, aiData: { enviar_qr: Boolean(qrCfg.qr), lead_updates: { etapa: 'qr_enviado', estado: 'esperando_comprobante' } }, incomingText: '[captura_prenda]' }).catch(() => null);
  await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_captura_prenda_recibida_qr', payload: { telefono: event.from, qr_enviado: Boolean(qrCfg.qr), qrSource: qrCfg.source }, estado: 'ok' }).catch(() => null);
  return { ok: true, provider: 'evolution', telefono: event.from, lead_id: lead.id, respuesta: respuestaTexto, qr_enviado: Boolean(qrCfg.qr), evolution: evoQrResponse };
}

async function enviarQrEvolutionDirecto({ empresa, lead, event, integration, iaConfig = {} }) {
  const qrCfg = await getQrPagoSeguro(empresa.id, iaConfig);
  const respuestaTexto = cleanOutgoingText(qrCfg.qr
    ? (qrCfg.texto || 'Te paso el QR bella 😊 Cuando hagas el pago, envíame el comprobante para que el equipo lo revise.')
    : 'Bella 😊 aún no tengo un QR configurado para enviarte. El equipo lo revisará y te ayudará por aquí.');

  let evoQrResponse = null;
  if (qrCfg.qr) {
    try {
      evoQrResponse = await sendEvolutionImage({
        instanceName: integration.instance_name || event.instanceName,
        to: event.from,
        image: qrCfg.qr,
        caption: respuestaTexto
      });
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_sent_direct', payload: { telefono: event.from, qrSource: qrCfg.source, hasQr: true }, estado: 'ok' }).catch(() => null);
    } catch (e) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_error_direct', payload: { telefono: event.from, qrSource: qrCfg.source }, estado: 'error', error: e.message }).catch(() => null);
      // Si falla imagen, al menos avisa sin volver a saludar.
      await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: respuestaTexto }).catch(() => null);
    }
  } else {
    await sendEvolutionText({ instanceName: integration.instance_name || event.instanceName, to: event.from, text: respuestaTexto }).catch(() => null);
    await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_requested_but_not_configured_direct', payload: { telefono: event.from }, estado: 'error', error: 'QR no configurado en empresa_admin_config.qr_pago_url' }).catch(() => null);
  }

  await saveConversation({
    empresaId: empresa.id,
    leadId: lead.id,
    telefono: event.from,
    rol: 'ia',
    mensaje: respuestaTexto,
    tipo: qrCfg.qr ? 'image' : 'text',
    metadata: { provider: 'evolution', regla_local: 'qr_directo', qrSource: qrCfg.source, from_me: true, qr_enviado: Boolean(qrCfg.qr) }
  }).catch(() => null);
  await upsertLiveFardoPedido({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, aiData: { enviar_qr: true, lead_updates: { etapa: 'qr_enviado', estado: 'esperando_comprobante' } }, incomingText: event.text }).catch(() => null);
  await setConversationStateLocal({ empresaId: empresa.id, leadId: lead.id, telefono: event.from, estado: 'qr_enviado', metadata: { qr_enviado: Boolean(qrCfg.qr), qrSource: qrCfg.source } });
  return { ok: true, provider: 'evolution', telefono: event.from, lead_id: lead.id, respuesta: respuestaTexto, qr_enviado: Boolean(qrCfg.qr), evolution: evoQrResponse };
}


function esEventoMedia(event = {}) {
  const tipo = String(event?.type || '').toLowerCase();
  const raw = event?.rawMessage || {};
  const msg = raw.message || raw.messages || raw;
  return ['image','video','document','audio','sticker'].includes(tipo) ||
    Boolean(msg.imageMessage || msg.videoMessage || msg.documentMessage || msg.audioMessage || msg.stickerMessage || raw.messageType?.includes?.('image'));
}

function textoClaroEvento(texto = '') {
  const t = normalizeTextBasic(texto);
  return t && !['[mensaje recibido]','imagen','[image]','foto','archivo recibido','[audio recibido]'].includes(t);
}

function esSinCapturaTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  return (t.includes('no') && (t.includes('captura') || t.includes('sacar captura'))) ||
    t.includes('no alcance') || t.includes('no pude sacar') || t.includes('se me paso') || t.includes('no tengo captura');
}

function esLinkLiveTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  return t.includes('link') || t.includes('tiktok') || t.includes('live') || t.includes('transmision') || t.includes('en vivo') || t.includes('perdi el live') || t.includes('perdi la transmision');
}

function esAgendarRecojoTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  if (esOtraPlazaNoTrompillo(t)) return false;
  return t.includes('agendar') || t.includes('agendarme') || t.includes('anotame para recoger') || t.includes('anótame para recoger') || t.includes('me anoto') || t.includes('voy a recoger');
}

function esUbicacionPrincipalTexto(texto = '') {
  const t = normalizeTextBasic(texto);
  return (t.includes('ubicacion') || t.includes('ubicación') || t.includes('direccion') || t.includes('dirección') || t.includes('donde estan')) &&
    !t.includes('delivery') && !t.includes('yango') && !t.includes('departamento') && !t.includes('provincia') && !t.includes('trompillo');
}

async function responderSinCapturaEvolution({ empresa, lead, event, integration }) {
  const respuesta = 'No te preocupes bella 😊 escríbenos en el Live para que vuelvan a mostrar la prenda y, cuando logres tomar la captura, me la envías por aquí para registrarla correctamente.';
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'sin_captura_prenda', estadoNuevo: 'esperando_captura_prenda' });
}

async function responderLinkLiveEvolution({ empresa, lead, event, integration, iaConfig = {} }) {
  const link = iaConfig?.tiktok || iaConfig?.tiktok_live_url || iaConfig?.admin_config?.tiktok || 'https://www.tiktok.com/@americanstyle48?_r=1&_t=ZS-97ZzOKHmEXx';
  const respuesta = `Claro bella 😊 te dejo el enlace oficial del Live de American Style:

${link}

Si deseas apartar una prenda, envíame la captura por aquí para registrarla correctamente. 💜`;
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'link_live_tiktok', estadoNuevo: 'live_detectado' });
}

async function responderUbicacionPrincipalEvolution({ empresa, lead, event, integration, iaConfig = {} }) {
  const link = iaConfig?.ubicacion_principal_url || iaConfig?.ubicacion_local_url || iaConfig?.admin_config?.ubicacion_principal_url || iaConfig?.direccion || '';
  const respuesta = link
    ? `Claro bella 😊 te comparto nuestra ubicación para que puedas pasar a recoger tu pedido:

${link}

Cuando estés cerca, escríbenos por aquí para coordinar la entrega. 💜`
    : 'Claro bella 😊 escríbenos por aquí antes de pasar a recoger para que el equipo te confirme la ubicación exacta.';
  return responderTextoEvolution({ empresa, lead, event, integration, respuesta, reglaLocal: 'ubicacion_principal', estadoNuevo: 'entrega_recojo_local' });
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
      metadata: { provider: 'evolution', evolution: event.rawMessage, instanceName: event.instanceName, contact_name: event.contactName, from_me: false, media_url: event.mediaUrl || null, media_mime_type: event.mimeType || null, media_filename: event.fileName || null }
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

    // V16.25: reglas locales con estado ANTES de llamar a la IA.
    // Mantiene la venta fluida: QR -> comprobante -> entrega, sin volver a saludar ni reiniciar.
    const iaConfigPre = await getIaConfig(empresa.id).catch(() => ({}));
    const state = await getConversationStateLocal({ empresaId: empresa.id, telefono: event.from });

    if (esComprobanteTexto(event.text)) {
      return await responderComprobanteEvolution({ empresa, lead, event, integration });
    }

    if (isAmericanStyle(empresa, iaConfigPre)) {
      // V16.27: imagen sola durante flujo de prenda = captura de prenda, NO comprobante.
      // Solo se acepta comprobante si el texto/caption habla de pago/comprobante.
      if (esEventoMedia(event) && !esComprobanteTexto(event.text)) {
        const estadosCaptura = ['inicio','live_detectado','esperando_datos_iniciales','esperando_captura_prenda'];
        if (estadosCaptura.includes(String(state?.estado || 'inicio'))) {
          return await responderCapturaPrendaEvolution({ empresa, lead, event, integration, iaConfig: iaConfigPre });
        }
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_media_saved_no_auto_reply', payload: { telefono: event.from, type: event.type, texto: event.text, estado: state.estado }, estado: 'ok' }).catch(() => null);
        return { ok: true, skipped: true, reason: 'media_guardada_sin_respuesta', telefono: event.from };
      }

      if (String(state?.estado || '') === 'esperando_datos_delivery' && textoClaroEvento(event.text)) {
        const tipoPendiente = state?.metadata?.reglaLocal === 'delivery_plaza_datos' ? 'delivery_plaza' : 'delivery_normal';
        await registrarDatosDeliveryLocal({ empresa, lead, event, tipo: tipoPendiente });
        return await responderTextoEvolution({ empresa, lead, event, integration, respuesta: 'Perfecto bella 😊 ya anoté tus datos de entrega. El equipo verificará el pago y coordinará el envío por este WhatsApp. 💜', reglaLocal: 'delivery_datos_recibidos', estadoNuevo: 'datos_delivery_recibidos' });
      }
      if (String(state?.estado || '') === 'esperando_datos_departamento' && textoClaroEvento(event.text)) {
        await registrarDatosDepartamentoLocal({ empresa, lead, event, iaConfig: iaConfigPre });
        return await responderTextoEvolution({ empresa, lead, event, integration, respuesta: 'Perfecto bella 😊 ya anoté tus datos para envío a departamento/provincia. El equipo preparará tus prendas y te confirmará la guía o transportadora por aquí. 💜', reglaLocal: 'departamento_datos_recibidos', estadoNuevo: 'datos_departamento_recibidos' });
      }
      if (esSinCapturaTexto(event.text)) {
        return await responderSinCapturaEvolution({ empresa, lead, event, integration });
      }
      if (esLinkLiveTexto(event.text)) {
        return await responderLinkLiveEvolution({ empresa, lead, event, integration, iaConfig: iaConfigPre });
      }
      if (esDepartamentoTexto(event.text)) {
        return await responderDepartamentoEvolution({ empresa, lead, event, integration, iaConfig: iaConfigPre });
      }
      if (esDeliveryTexto(event.text)) {
        return await responderDeliveryEvolution({ empresa, lead, event, integration });
      }
      if (esAgendarRecojoTexto(event.text) || esRecojoTrompilloTexto(event.text)) {
        return await responderRecojoTrompilloEvolution({ empresa, lead, event, integration, iaConfig: iaConfigPre });
      }
      if (esUbicacionPrincipalTexto(event.text)) {
        return await responderUbicacionPrincipalEvolution({ empresa, lead, event, integration, iaConfig: iaConfigPre });
      }
      if (esMasTardeTexto(event.text)) {
        return await responderMasTardeEvolution({ empresa, lead, event, integration, state });
      }
      // Primer contacto: registrar nombre + alias TikTok y pedir captura antes de QR.
      const estadoActual = String(state?.estado || 'inicio');
      if (estadoActual === 'inicio' && textoClaroEvento(event.text)) {
        return await responderRegistroInicialEvolution({ empresa, lead, event, integration });
      }
      if (estadoActual === 'esperando_datos_iniciales' && textoClaroEvento(event.text)) {
        return await responderPedirCapturaEvolution({ empresa, lead, event, integration });
      }
    } else if (esEventoMedia(event) && !esComprobanteTexto(event.text)) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_media_saved_no_auto_reply', payload: { telefono: event.from, type: event.type, texto: event.text, estado: state.estado }, estado: 'ok' }).catch(() => null);
      return { ok: true, skipped: true, reason: 'media_guardada_sin_respuesta', telefono: event.from };
    }

    const pidioQRDirecto = pidioQrPago(event.text) || await usuarioEstaConfirmandoQr({ empresaId: empresa.id, telefono: event.from, texto: event.text });
    if (pidioQRDirecto) {
      return await enviarQrEvolutionDirecto({ empresa, lead, event, integration, iaConfig: iaConfigPre });
    }

    const [iaConfig, knowledge, history] = await Promise.all([
      getIaConfig(empresa.id),
      getKnowledge(empresa.id),
      getConversationHistory(lead.id, event.from, 18, empresa.id)
    ]);

    const ai = await generateAiReply({ empresa, iaConfig, knowledge, lead, history, incomingText: event.text });
    ai.respuesta = cleanOutgoingText(ai.respuesta);
    // Si ya existe contexto, evita saludos repetidos en American Style.
    const statePost = await getConversationStateLocal({ empresaId: empresa.id, telefono: event.from });
    if (isAmericanStyle(empresa, iaConfig) && statePost?.estado && statePost.estado !== 'inicio') {
      ai.respuesta = String(ai.respuesta || '').replace(/^\s*(¡?hola[^.!?]*[.!?]\s*)/i, '').trim() || ai.respuesta;
    }
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
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_error', payload: { error: evoQrResponse.error, hasQr: Boolean(qrCfg.qr), qrSource: qrCfg.source }, estado: 'error', error: evoQrResponse.error }).catch(() => null);
      } else {
        await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_image_sent', payload: { telefono: event.from, qrSource: qrCfg.source }, estado: 'ok' }).catch(() => null);
      }
    } else if ((ai.enviar_qr || pidioQR) && !qrCfg.qr) {
      await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'evolution_qr_requested_but_not_configured', payload: { texto: event.text }, estado: 'error', error: 'QR no configurado. Guarda una URL pública en live_fardo_config.qr_imagen_url o empresa_admin_config.qr_imagen_url' }).catch(() => null);
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
