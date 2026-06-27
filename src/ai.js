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

  if (rubro.includes('negocio_digital') || rubro.includes('servicios_digitales') || rubro.includes('digital') || rubro.includes('wordpress') || rubro.includes('hosting') || rubro.includes('chatflow')) {
    return buildPromptNegocioDigital({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText });
  }

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


function buildPromptNegocioDigital({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText }) {
  return `
Eres ${iaConfig.nombre_asistente || 'Asistente Digital de Fernando'}, asistente de WhatsApp de ${empresa.nombre || 'Fernando Digital'}.

RUBRO REAL DE LA EMPRESA:
Negocio digital de Fernando: páginas web, WordPress, hosting, dominio, correos corporativos, IA para WhatsApp, WhatsApp API, QR asistido, dashboards y SaaS ChatFlow 360.

OBJETIVO:
Atender prospectos interesados en servicios digitales, entender qué necesita su negocio, explicar opciones, mostrar planes referenciales y agendar una llamada o reunión con Fernando.

PROHIBIDO:
- No respondas como tienda de ropa.
- No respondas como agencia de viajes.
- No respondas como clínica dental.
- No inventes precios finales sin revisar el proyecto.
- No prometas funciones avanzadas sin decir que Fernando debe revisarlo.
- No hables largo; WhatsApp debe sentirse breve y natural.

TONO:
${iaConfig.tono || 'Amable, profesional, cercano, comercial, claro y moderno.'}

SERVICIOS QUE OFRECE FERNANDO:
${iaConfig.reglas || ''}
- Páginas web para negocios: presencia digital, servicios, productos, ubicación, WhatsApp, redes, formularios y diseño adaptable a celular.
- WordPress: creación o rediseño de sitios administrables.
- Hosting, dominio y correos corporativos.
- IA para WhatsApp: respuestas automáticas, toma de datos, preguntas frecuentes y derivación a humano.
- WhatsApp API / QR asistido: conexión para pilotos o conexión oficial según el caso.
- ChatFlow 360: SaaS con dashboard, clientes, conversaciones, IA, pagos, vencimientos, plantillas por rubro y automatización WhatsApp.

PLANES REFERENCIALES:
- IA WhatsApp Básico: desde 200 Bs mensuales para negocios pequeños que quieren responder consultas básicas y tomar datos.
- Página Web Básica: web informativa con WhatsApp, ubicación, redes y secciones básicas.
- Página Web Profesional: servicios, galería, formularios, testimonios, contacto y estructura profesional.
- WordPress: instalación, diseño y configuración editable.
- ChatFlow 360: mensualidad según tipo de negocio y funciones.

REGLAS DE ATENCIÓN:
- Haz una pregunta por mensaje.
- Primero identifica qué tipo de negocio tiene el cliente.
- Luego identifica qué necesita: página web, WordPress, hosting/correos, IA WhatsApp, WhatsApp API o ChatFlow 360.
- Si pregunta por precio, usa precios referenciales y aclara que Fernando confirma según el alcance.
- Si pregunta por ejemplos, responde que Fernando puede mostrar páginas, dashboards y sistemas ya creados según el tipo de proyecto.
- Si quiere avanzar, pide nombre, negocio, ciudad, servicio que necesita, WhatsApp y horario para llamada.
- Si pide una cita, agenda conversacionalmente: “¿Qué día y hora te queda bien para que Fernando te explique?”
- Si no sabes algo técnico, di que Fernando lo revisará y le dará una propuesta clara.

MENSAJE DE BIENVENIDA BASE:
${iaConfig.mensaje_bienvenida || '¡Hola! Soy el asistente digital de Fernando 😊 Ayudamos a negocios con páginas web, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas como ChatFlow 360. ¿Qué necesitas mejorar en tu negocio: tu página web, tu WhatsApp, tus clientes o tu sistema de atención?'}

RESPUESTA DE PRECIO BASE:
${iaConfig.respuesta_precio || 'Depende de lo que necesites 😊 Para IA básica en WhatsApp tenemos planes desde 200 Bs mensuales. Para páginas web o WordPress, el precio depende de si quieres una página simple, profesional, catálogo, dominio, hosting o correos.'}

DATOS DE EMPRESA:
- Empresa: ${empresa.nombre || ''}
- Rubro: ${empresa.rubro || ''}
- WhatsApp: ${empresa.whatsapp || ''}
- Web: ${empresa.web || ''}
- Zona horaria: ${empresa.timezone || 'America/La_Paz'}

SERVICIOS / DATOS CARGADOS:
- ${servicios || 'Páginas web, WordPress, hosting, dominio, correos corporativos, IA WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360.'}

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

function cleanWhatsappAnswer(value) {
  if (value === undefined || value === null) return '';

  if (typeof value === 'object') {
    if (value.respuesta !== undefined) return cleanWhatsappAnswer(value.respuesta);
    if (value.message !== undefined) return cleanWhatsappAnswer(value.message);
    if (value.text !== undefined) return cleanWhatsappAnswer(value.text);
    return '';
  }

  let raw = String(value || '').trim();

  // Si por algún motivo llega el JSON completo como texto, extraer solo respuesta.
  const parsed = extractJsonObject(raw);
  if (parsed && typeof parsed === 'object' && parsed.respuesta !== undefined) {
    return cleanWhatsappAnswer(parsed.respuesta);
  }

  // Quitar fences de markdown si el modelo los devuelve.
  raw = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  // Limpieza de seguridad por si queda algo como: respuesta: "..."
  const match = raw.match(/^\s*[\{]?\s*["']?respuesta["']?\s*[:=]\s*["']([\s\S]*?)["']\s*[\}]?\s*$/i);
  if (match) return match[1].trim();

  return raw;
}

function normalizeAiResponse(text) {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    return {
      respuesta: limitText(cleanWhatsappAnswer(text) || 'Gracias por escribir. Un asesor de la empresa te responderá en breve.', 1200),
      requiere_asesor: true,
      motivo_derivacion: 'La IA no devolvió JSON válido.',
      lead_updates: { requiere_asesor: true, estado: 'derivado_asesor' }
    };
  }
  return {
    respuesta: limitText(cleanWhatsappAnswer(parsed.respuesta) || 'Gracias por escribir. ¿Me indica su nombre?', 1200),
    requiere_asesor: Boolean(parsed.requiere_asesor || parsed.derivar),
    motivo_derivacion: parsed.motivo_derivacion || '',
    lead_updates: parsed.lead_updates || parsed.lead || {}
  };
}

function mockReply({ incomingText, lead, empresa }) {
  const rubro = normalizeRubro(empresa?.rubro || '');
  const text = String(incomingText || '').toLowerCase();
  const requires = ['asesor', 'humano', 'precio', 'costo', 'pago', 'qr', 'comprobante', 'reclamo'].some((x) => text.includes(x));

  if (rubro.includes('negocio_digital') || rubro.includes('servicios_digitales') || rubro.includes('digital') || rubro.includes('wordpress') || rubro.includes('hosting') || rubro.includes('chatflow')) {
    let respuesta = '¡Hola! Soy el asistente digital de Fernando 😊 Ayudamos a negocios con páginas web, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas como ChatFlow 360. ¿Qué necesitas mejorar en tu negocio?';
    if (text.includes('precio') || text.includes('cuanto') || text.includes('cuánto') || text.includes('costo')) respuesta = 'Depende de lo que necesites 😊 Para IA básica en WhatsApp tenemos planes desde 200 Bs mensuales. Para páginas web o WordPress, el precio depende del alcance. ¿Qué tipo de proyecto necesitas?';
    if (text.includes('wordpress')) respuesta = 'Claro 😊 Podemos crear o rediseñar tu página en WordPress. ¿Ya tienes dominio y hosting o empezaríamos desde cero?';
    if (text.includes('hosting') || text.includes('dominio') || text.includes('correo')) respuesta = 'Sí 😊 Podemos ayudarte con dominio, hosting y correos corporativos. ¿Cuántos correos necesitas y ya tienes dominio comprado?';
    if (text.includes('ia') || text.includes('whatsapp') || text.includes('wasap') || text.includes('api')) respuesta = 'Sí 😊 Podemos ayudarte a poner una IA en tu WhatsApp para responder consultas, tomar datos y pasar a humano cuando sea necesario. ¿Qué tipo de negocio tienes?';
    if (text.includes('cita') || text.includes('reun')) respuesta = 'Perfecto 😊 ¿Qué día y hora te queda bien para que Fernando te explique y te dé una propuesta clara?';
    return { respuesta, requiere_asesor: requires, motivo_derivacion: requires ? 'Prospecto solicita precio/pago/humano o revisión comercial.' : '', lead_updates: { estado: 'en_proceso', etapa: 'interesado', servicio_solicitado: 'servicios_digitales' } };
  }

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

module.exports = { generateAiReply, buildPrompt, cleanWhatsappAnswer };
