const { config } = require('./env');
const { extractJsonObject, limitText } = require('./utils');

function buildPrompt({ empresa, iaConfig, knowledge, lead, history, incomingText }) {
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

  return `
Eres ${iaConfig.nombre_asistente || 'Asistente la empresa'}, asistente de WhatsApp de ${empresa.nombre || 'la empresa Asesores de Viaje'}.

OBJETIVO:
Responder por WhatsApp, captar datos del cliente y avanzar la venta sin inventar requisitos, precios finales ni prometer aprobación de visa.

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

RESPONDE SOLO JSON VÁLIDO, sin markdown, con esta forma exacta:
{
  "respuesta": "texto corto para WhatsApp",
  "requiere_asesor": false,
  "motivo_derivacion": "",
  "lead_updates": {
    "nombre_completo": "",
    "motivo_viaje": "",
    "tuvo_visa": "",
    "visa_negada": "",
    "visa_revocada": "",
    "infraccion_migratoria": "",
    "ciudad_origen": "",
    "pais_origen": "",
    "destino": "",
    "fecha_viaje": "",
    "numero_personas": null,
    "presupuesto": null,
    "pasaporte_vigente": "",
    "necesita_visa": false,
    "cotiza_pasajes": false,
    "hotel_incluido": false,
    "seguro_viaje": false,
    "servicio_solicitado": "",
    "comentarios": "",
    "estado": "en_proceso",
    "etapa": "interesado"
  }
}`.trim();
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
    respuesta: limitText(parsed.respuesta || 'Gracias por escribir. ¿Me indica su nombre completo?', 1200),
    requiere_asesor: Boolean(parsed.requiere_asesor || parsed.derivar),
    motivo_derivacion: parsed.motivo_derivacion || '',
    lead_updates: parsed.lead_updates || parsed.lead || {}
  };
}

function mockReply({ incomingText, lead }) {
  const text = String(incomingText || '').toLowerCase();
  const requires = ['asesor', 'humano', 'precio', 'costo', 'pago', 'qr', 'negada', 'rechazo', 'revocada'].some((x) => text.includes(x));
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
