const { config } = require('./env');
const { extractJsonObject, limitText } = require('./utils');

function normalizeRubro(rubro = '') {
  return String(rubro || '').toLowerCase().trim();
}

function buildPrompt({ empresa, iaConfig, knowledge, lead, history, incomingText }) {
  const rubro = normalizeRubro(empresa?.rubro || empresa?.tipo_negocio || iaConfig?.rubro);

  const servicios = [
    ...(Array.isArray(knowledge.servicios) ? knowledge.servicios.map((s) => `${s.nombre}: ${s.descripcion || ''}`) : []),
    ...(Array.isArray(iaConfig.servicios) ? iaConfig.servicios : [])
  ].filter(Boolean).slice(0, 40).join('\n- ');

  const fuentes = (knowledge.fuentes || [])
    .slice(0, 30)
    .map((s) => `[P${s.prioridad || 2}] ${s.nombre} - ${s.url || ''} - ${s.notas || ''}`)
    .join('\n- ');

  const faqs = (knowledge.faqs || [])
    .slice(0, 20)
    .map((f) => `P: ${f.pregunta}\nR: ${f.respuesta}`)
    .join('\n\n');

  const historial = (history || [])
    .map((m) => `${m.rol}: ${m.mensaje}`)
    .join('\n');

  if (rubro.includes('venta_live_fardo') || rubro.includes('live') || rubro.includes('fardo') || rubro.includes('ropa') || rubro.includes('tienda')) {
    return buildPromptRopa({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText });
  }

  if (rubro.includes('clinica') || rubro.includes('dental') || rubro.includes('odont')) {
    return buildPromptClinica({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText });
  }

  return buildPromptViajes({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText });
}

function jsonContract() {
  return `RESPONDE SOLO JSON VÁLIDO, sin markdown, con esta forma exacta:
{
  "respuesta": "texto corto para WhatsApp",
  "requiere_asesor": false,
  "motivo_derivacion": "",
  "lead_updates": {
    "nombre_completo": "",
    "ciudad_origen": "",
    "pais_origen": "",
    "destino": "",
    "numero_personas": null,
    "presupuesto": null,
    "servicio_solicitado": "",
    "comentarios": "",
    "estado": "en_proceso",
    "etapa": "interesado",
    "requiere_asesor": false
  }
}`;
}

function buildPromptRopa({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText }) {
  return `
Eres ${iaConfig.nombre_asistente || 'Asistente de American Style'}, asistente de WhatsApp de ${empresa.nombre || 'American Style'}.

RUBRO REAL DE LA EMPRESA:
Tienda de ropa para mujer, venta por WhatsApp, TikTok Live, catálogo, apartados, acumulados, delivery, recojo y envíos.

OBJETIVO:
Atender clientas interesadas en ropa, pedir captura de la prenda cuando vienen del live, registrar intención de compra, pedir datos mínimos para entrega y derivar a humano cuando se necesite verificar stock, precio, pago o prenda repetida.

PROHIBIDO:
- No hables de visas, pasajes, hoteles, paquetes turísticos, viajes ni seguros de viaje.
- No digas que la empresa hace viajes.
- No confirmes pagos automáticamente.
- No prometas stock/precio final si no está confirmado.
- No mandes campañas ni mensajes masivos; responde solo al mensaje entrante.

TONO:
${iaConfig.tono || 'Amable, cercano, breve, vendedor y natural tipo WhatsApp.'}

REGLAS DE ATENCIÓN PARA ROPA:
${iaConfig.reglas || ''}
- Si la clienta saluda o dice que quiere ropa, responde como tienda de ropa.
- Si dice “vengo del live”, “del live”, “quiero esa”, “quiero esta prenda”, pide captura de la prenda.
- Si manda captura o describe una prenda, pide nombre y zona/ciudad si falta.
- Pregunta solo una cosa por mensaje.
- Formas de entrega: recojo, delivery local o envío a provincia/departamento.
- Si pregunta precio/stock y no hay dato cargado, di que el equipo verificará disponibilidad y precio.
- Si pide QR o pago, puedes decir que se le pasará el QR o que el equipo confirma el pago según corresponda.
- Si manda comprobante, responde: “Gracias, recibimos tu comprobante ✅ El equipo verificará el pago y preparará tu pedido.”
- Si parece prenda repetida/apartada o hay duda, responde que una persona verificará disponibilidad.
- Si pide humano, reclamo, devolución, pago confirmado, prenda duplicada o caso confuso, marca requiere_asesor=true.

MENSAJE DE BIENVENIDA BASE:
${iaConfig.mensaje_bienvenida || '¡Hola! Soy el asistente de American Style 😊 ¿Vienes del live o buscas alguna prenda en especial? Puedes enviarme captura de la prenda que te gustó.'}

DATOS DE EMPRESA:
- Empresa: ${empresa.nombre || ''}
- Rubro: ${empresa.rubro || ''}
- WhatsApp: ${empresa.whatsapp || ''}
- Horario lunes-viernes: ${empresa.horario_lunes_viernes || ''}
- Horario sábado: ${empresa.horario_sabado || ''}
- Zona horaria: ${empresa.timezone || 'America/La_Paz'}

SERVICIOS / DATOS CARGADOS:
- ${servicios || 'Ropa de mujer, prendas únicas, apartados, acumulados, delivery, recojo y envíos.'}

FUENTES / BASE IA:
- ${fuentes || 'Datos cargados en el dashboard.'}

FAQ:
${faqs || 'Sin FAQ cargado.'}

DATOS ACTUALES DEL LEAD:
${JSON.stringify(lead || {}, null, 2)}

HISTORIAL RECIENTE:
${historial || 'Sin historial previo.'}

MENSAJE NUEVO DEL CLIENTE:
${incomingText}

${jsonContract()}`.trim();
}

function buildPromptClinica({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText }) {
  return `
Eres ${iaConfig.nombre_asistente || 'Asistente de clínica dental'}, asistente de WhatsApp de ${empresa.nombre || 'la clínica dental'}.

OBJETIVO:
Atender pacientes, explicar servicios odontológicos de forma simple, pedir motivo de consulta y datos básicos para agendar. No diagnostiques de forma definitiva.

REGLAS:
${iaConfig.reglas || ''}
- No des diagnóstico definitivo.
- Si hay dolor fuerte, sangrado, hinchazón, fiebre o urgencia, deriva a humano.
- Pide nombre, motivo de consulta y horario preferido.
- Pregunta una cosa por mensaje.

SERVICIOS:
- ${servicios || 'Consulta dental, limpieza, restauraciones, ortodoncia, extracciones, emergencias odontológicas.'}

FAQ:
${faqs || 'Sin FAQ cargado.'}

DATOS ACTUALES DEL LEAD:
${JSON.stringify(lead || {}, null, 2)}

HISTORIAL RECIENTE:
${historial || 'Sin historial previo.'}

MENSAJE NUEVO DEL CLIENTE:
${incomingText}

${jsonContract()}`.trim();
}

function buildPromptViajes({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText }) {
  return `
Eres ${iaConfig.nombre_asistente || 'Asistente de viajes'}, asistente de WhatsApp de ${empresa.nombre || 'la empresa de viajes'}.

OBJETIVO:
Responder por WhatsApp, captar datos del cliente y avanzar la venta de servicios de viajes sin inventar requisitos, precios finales ni prometer aprobación de visa.

TONO:
${iaConfig.tono || 'Amable, profesional, breve, natural y vendedor tipo WhatsApp.'}

DATOS DE EMPRESA:
- Empresa: ${empresa.nombre || ''}
- Web: ${empresa.web || ''}
- WhatsApp: ${empresa.whatsapp || ''}
- Horario lunes-viernes: ${empresa.horario_lunes_viernes || ''}
- Horario sábado: ${empresa.horario_sabado || ''}
- Zona horaria: ${empresa.timezone || 'America/La_Paz'}

REGLAS:
${iaConfig.reglas || ''}
- Haz una pregunta por mensaje.
- No des asesoría legal definitiva.
- Si faltan datos, pregunta el dato más importante que falte.
- Si el cliente pide humano, precio final, pago, caso delicado, molestia, audio/documento complejo o visa negada/revocada, marca requiere_asesor=true.
- Para precios usa: ${iaConfig.respuesta_precio || 'Un asesor confirmará el costo exacto.'}
- Para bienvenida usa como base: ${iaConfig.mensaje_bienvenida || ''}

SERVICIOS:
- ${servicios || 'Asesoría de visa, pasajes, hoteles, paquetes turísticos, seguro de viaje.'}

FUENTES / BASE IA:
- ${fuentes || 'Supabase y fuentes oficiales cargadas.'}

FAQ:
${faqs || 'Sin FAQ cargado.'}

DATOS ACTUALES DEL LEAD:
${JSON.stringify(lead || {}, null, 2)}

HISTORIAL RECIENTE:
${historial || 'Sin historial previo.'}

MENSAJE NUEVO DEL CLIENTE:
${incomingText}

${jsonContract()}`.trim();
}

async function generateAiReply(context) {
  const prompt = buildPrompt(context);
  if (config.aiProvider === 'gemini' && config.geminiApiKey) return callGemini(prompt);
  if (config.aiProvider === 'openai' && config.openaiApiKey) return callOpenAiCompatible(prompt, {
    apiKey: config.openaiApiKey,
    baseUrl: config.openaiBaseUrl,
    model: config.openaiModel
  });
  if (config.aiProvider === 'deepseek' && config.deepseekApiKey) return callOpenAiCompatible(prompt, {
    apiKey: config.deepseekApiKey,
    baseUrl: config.deepseekBaseUrl,
    model: config.deepseekModel
  });
  return mockReply(context);
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 900,
        responseMimeType: 'application/json'
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || '';
  return normalizeAiResponse(text);
}

async function callOpenAiCompatible(prompt, { apiKey, baseUrl, model }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Responde solo JSON válido para un webhook de WhatsApp.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `AI HTTP ${response.status}`);
  const text = data?.choices?.[0]?.message?.content || '';
  return normalizeAiResponse(text);
}

function normalizeAiResponse(text) {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    return {
      respuesta: limitText(text || 'Gracias por escribir. Un asesor de la empresa te responderá en breve.', 1200),
      requiere_asesor: true,
      motivo_derivacion: 'La IA no devolvió JSON válido.',
      lead_updates: { requiere_asesor: true, estado: 'derivado_asesor' }
    };
  }
  return {
    respuesta: limitText(parsed.respuesta || 'Gracias por escribir. ¿Me indica su nombre?', 1200),
    requiere_asesor: Boolean(parsed.requiere_asesor || parsed.derivar),
    motivo_derivacion: parsed.motivo_derivacion || '',
    lead_updates: parsed.lead_updates || parsed.lead || {}
  };
}

function mockReply({ incomingText, lead, empresa }) {
  const rubro = normalizeRubro(empresa?.rubro || '');
  const text = String(incomingText || '').toLowerCase();
  const requires = ['asesor', 'humano', 'precio', 'costo', 'pago', 'qr', 'comprobante', 'reclamo'].some((x) => text.includes(x));
  if (rubro.includes('fardo') || rubro.includes('ropa') || rubro.includes('tienda') || rubro.includes('live')) {
    let respuesta = '¡Hola! Soy el asistente de American Style 😊 ¿Vienes del live o buscas alguna prenda en especial? Puedes enviarme captura de la prenda que te gustó.';
    if (text.includes('ropa') || text.includes('prenda') || text.includes('live')) respuesta = 'Perfecto 😊 ¿Puedes enviarme una captura de la prenda que te gustó para verificar disponibilidad?';
    if (text.includes('precio') || text.includes('cuanto') || text.includes('cuánto')) respuesta = 'Claro 😊 Envíame captura de la prenda y el equipo verificará precio y disponibilidad.';
    if (text.includes('comprobante')) respuesta = 'Gracias, recibimos tu comprobante ✅ El equipo verificará el pago y preparará tu pedido.';
    return { respuesta, requiere_asesor: requires, motivo_derivacion: requires ? 'Requiere verificación humana.' : '', lead_updates: { estado: 'en_proceso', etapa: 'interesado', servicio_solicitado: 'ropa' } };
  }
  let respuesta = '👋 Gracias por escribir a la empresa. Para ayudarte mejor, ¿cuál es tu nombre completo?';
  if (lead?.nombre_completo && !lead?.destino) respuesta = 'Perfecto. ¿A qué destino deseas viajar y cuál es el motivo del viaje?';
  else if (lead?.destino && !lead?.fecha_viaje) respuesta = 'Excelente. ¿Para qué fecha aproximada estás planificando tu viaje?';
  else if (requires) respuesta = 'Perfecto, voy a dejar tu solicitud para que un asesor de la empresa te confirme los detalles exactos.';
  return {
    respuesta,
    requiere_asesor: requires,
    motivo_derivacion: requires ? 'Cliente pidió dato sensible/comercial o humano.' : '',
    lead_updates: {
      estado: requires ? 'derivado_asesor' : 'en_proceso',
      etapa: requires ? 'requiere_asesor' : 'interesado',
      requiere_asesor: requires
    }
  };
}

module.exports = { generateAiReply, buildPrompt };
