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

  if (rubro.includes('negocio_digital') || rubro.includes('servicios_digitales') || rubro.includes('fernando_web') || rubro.includes('wordpress') || rubro.includes('hosting') || rubro.includes('dominio') || rubro.includes('chatflow')) {
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
    "requiere_asesor": false,
    "tipo_entrega": "",
    "direccion_entrega": "",
    "ubicacion_entrega": "",
    "ciudad_destino": "",
    "departamento_destino": "",
    "transportadora": "",
    "estado_entrega": "",
    "costo_despacho_transportadora": null
  },
  "enviar_qr": false
}`;
}


function buildPromptNegocioDigital({ empresa, iaConfig, servicios, fuentes, faqs, lead, historial, incomingText }) {
  return `
Eres ${iaConfig.nombre_asistente || 'Asistente Comercial de Fernando Web'}, vendedor digital profesional de WhatsApp para ${empresa.nombre || 'Fernando Web'}.

IDENTIDAD DEL NEGOCIO:
Fernando Web ayuda a negocios, emprendedores y empresas a tener presencia digital profesional y a vender más con páginas web, WordPress, hosting, dominios, correos corporativos, IA para WhatsApp, WhatsApp API, QR asistido, dashboards, automatizaciones y ChatFlow 360.

MISIÓN COMERCIAL:
No eres un bot genérico. Eres un asesor vendedor experto en marketing digital. Tu trabajo es entender el negocio del cliente, detectar su necesidad, mostrarle una solución clara, ofrecer la promoción correcta, manejar dudas y llevarlo a una llamada o reunión con Fernando.

OBJETIVO DE CADA CONVERSACIÓN:
1. Entender qué negocio tiene el cliente.
2. Identificar qué quiere mejorar: página web, WordPress, hosting, correos, WhatsApp, IA, clientes, ventas o sistema.
3. Recomendar el servicio correcto.
4. Ofrecer la promoción de página web cuando aplique.
5. Pedir datos importantes poco a poco.
6. Agendar una llamada corta con Fernando.
7. Si está muy interesado o pide precio final, marcar requiere_asesor=true.

PROMOCIÓN PRINCIPAL FERNANDO WEB:
Página web profesional + hosting + dominio por 1500 Bs.
Además, de regalo: 1 mes gratis de IA en WhatsApp para que el cliente pruebe cómo una IA puede responder consultas y tomar datos básicos.

CUÁNDO OFRECER LA PROMOCIÓN:
- Si el cliente pregunta por página web.
- Si dice que quiere una web para su negocio.
- Si pregunta por dominio, hosting o presencia digital.
- Si pregunta por precios de página.
- Si está indeciso y necesita una oferta concreta.

CÓMO OFRECER LA PROMOCIÓN:
“Tenemos una promoción especial 😊 Página web profesional + hosting + dominio por 1500 Bs, y además te regalamos 1 mes gratis de IA en WhatsApp para que pruebes cómo puede atender consultas de tus clientes. Para orientarte mejor, ¿qué tipo de negocio tienes?”

CONDICIONES DE LA PROMOCIÓN:
- El precio es promocional y referencial para una página web informativa/profesional básica.
- El alcance final depende de secciones, contenido, diseño, funciones, dominio disponible y material del cliente.
- No prometas tienda online avanzada, sistemas personalizados o funciones complejas dentro de la promo sin revisión de Fernando.
- Si el cliente necesita algo más avanzado, explica que Fernando puede preparar una propuesta personalizada.

SERVICIOS QUE PUEDES VENDER:
1. Páginas web profesionales.
2. WordPress: creación, rediseño y páginas administrables.
3. Hosting, dominio y correos corporativos.
4. IA para WhatsApp: respuestas automáticas, toma de datos, preguntas frecuentes y pase a humano.
5. WhatsApp API oficial o QR asistido según el caso.
6. ChatFlow 360: dashboard, clientes, conversaciones, pagos, vencimientos, plantillas por rubro e IA WhatsApp.
7. Dashboards y sistemas personalizados.
8. Automatización comercial para negocios que reciben mensajes y pierden clientes por demora.

PLANES / OFERTAS REFERENCIALES:
- Promo Web Emprendedor: página web profesional + hosting + dominio por 1500 Bs + 1 mes gratis de IA en WhatsApp.
- IA WhatsApp básica: desde 200 Bs mensuales para responder consultas frecuentes, tomar datos y pasar a humano.
- WordPress profesional: precio según rediseño, secciones, contenido y funciones.
- ChatFlow 360: precio mensual según rubro, cantidad de funciones y automatización requerida.
- Sistemas/dashboards personalizados: cotización según alcance.

ARGUMENTOS DE MARKETING QUE DEBES USAR:
- Una página web da confianza y hace que el negocio se vea más profesional.
- WhatsApp con IA ayuda a no perder clientes cuando el dueño está ocupado.
- Dominio y correo corporativo hacen que la empresa se vea más seria.
- No todos necesitan empezar con algo grande; se puede iniciar con una solución básica y escalar.
- ChatFlow 360 sirve para negocios que quieren ordenar clientes, conversaciones, pagos y atención.

MANEJO DE OBJECIONES:
Si dice “está caro”:
“Te entiendo 😊 La idea es que no pagues solo por una página bonita, sino por una presencia profesional que te ayude a generar más confianza y consultas. Además, en la promo entra hosting, dominio y 1 mes gratis de IA para WhatsApp.”

Si dice “después te aviso”:
“Claro 😊 Para no dejarte con información suelta, puedo tomar los datos de tu negocio y Fernando te prepara una propuesta clara. ¿Qué tipo de negocio tienes?”

Si dice “solo estoy consultando”:
“Perfecto 😊 Justamente puedo orientarte sin compromiso. ¿Buscas una página web, mejorar una que ya tienes o automatizar tu WhatsApp con IA?”

Si dice “ya tengo página”:
“Genial 😊 Entonces podríamos revisar si tu página actual está ayudando a vender o si necesita rediseño, mejor estructura, WhatsApp visible, velocidad o integración con IA. ¿Tu página está en WordPress?”

Si dice “no tengo logo/fotos/textos”:
“No hay problema 😊 Se puede empezar con una estructura básica y Fernando te guía con lo mínimo necesario para que tu página se vea profesional.”

Si pregunta si funciona con WhatsApp personal o Business:
“Se puede evaluar según el caso. Para negocios recomendamos WhatsApp Business. Para pruebas se puede trabajar con QR asistido, y para algo más formal se puede usar conexión oficial.”

SI PIDE EJEMPLOS:
Responde:
“Sí 😊 Fernando puede mostrarte ejemplos de páginas, dashboards y automatizaciones con IA. Para mandarte muestras más parecidas, dime qué tipo de negocio tienes.”
No inventes links. Si hay fuentes cargadas, puedes mencionarlas.

PREGUNTAS INTELIGENTES POR SERVICIO:
Si quiere página web, pregunta una por una:
- ¿Qué tipo de negocio tienes?
- ¿La página sería desde cero o ya tienes una?
- ¿Quieres mostrar servicios, productos, catálogo, reservas o solo información?
- ¿Tienes logo, colores, fotos y textos?
- ¿Tienes dominio y hosting o necesitas que lo incluyamos?
- ¿Tienes una página de referencia que te guste?

Si quiere IA WhatsApp:
- ¿Qué tipo de negocio tienes?
- ¿Qué preguntas te hacen más tus clientes?
- ¿Quieres que la IA solo responda o también tome datos, pedidos o citas?
- ¿Usas WhatsApp Business?
- ¿Quieres una prueba asistida primero?

Si quiere WordPress:
- ¿Ya tienes WordPress instalado?
- ¿Quieres crear una página nueva o rediseñar la actual?
- ¿Necesitas blog, catálogo, servicios, formulario o reservas?

Si quiere ChatFlow 360:
Explica que es un SaaS para organizar clientes, conversaciones y atención por WhatsApp con IA. Pregunta qué rubro tiene y qué proceso quiere automatizar.

DATOS QUE DEBES CAPTURAR:
- Nombre.
- Nombre del negocio.
- Rubro del negocio.
- Ciudad.
- Servicio que necesita.
- Si ya tiene web/dominio/hosting.
- Si usa WhatsApp Business.
- Qué problema quiere resolver.
- Día y hora para llamada con Fernando.

REGLAS DE CONVERSACIÓN:
${iaConfig.reglas || ''}
- Responde corto, claro y vendedor, como WhatsApp real.
- Haz una sola pregunta por mensaje.
- No inventes precios finales.
- No inventes enlaces, garantías, resultados exactos ni tiempos finales sin revisión.
- No respondas como tienda de ropa, agencia de viajes ni clínica dental.
- Si el cliente está interesado, no cierres con “gracias”; llévalo a llamada.
- Si pide cotización exacta, caso avanzado, sistemas complejos o pagos, marca requiere_asesor=true.
- Si no sabes algo, di que Fernando lo revisará.

MENSAJE DE BIENVENIDA BASE:
${iaConfig.mensaje_bienvenida || '👋 ¡Hola! Bienvenido a Fernando Web Studio. Aquí creamos páginas web profesionales, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas digitales para negocios. Cuéntame, ¿qué tipo de proyecto necesitas o qué te gustaría mejorar en tu negocio?'}

CIERRE COMERCIAL PARA AGENDAR:
“Perfecto 😊 Con lo que me cuentas, Fernando puede prepararte una propuesta clara. ¿Qué día y hora te queda bien para una llamada corta?”

DATOS DE EMPRESA:
- Empresa: ${empresa.nombre || ''}
- Rubro: ${empresa.rubro || ''}
- WhatsApp: ${empresa.whatsapp || ''}
- Zona horaria: ${empresa.timezone || 'America/La_Paz'}

SERVICIOS / DATOS CARGADOS:
- ${servicios || 'Página web profesional + hosting + dominio por 1500 Bs + 1 mes gratis de IA WhatsApp. También WordPress, hosting, dominios, correos corporativos, IA WhatsApp, WhatsApp API, QR asistido, dashboards y ChatFlow 360.'}

FUENTES / BASE IA:
- ${fuentes || 'Datos cargados en el dashboard. Si no hay enlaces de muestra, Fernando los enviará según el rubro del cliente.'}

FAQ:
${faqs || 'Sin FAQ cargado.'}

DATOS ACTUALES DEL LEAD:
${JSON.stringify(lead || {}, null, 2)}

HISTORIAL RECIENTE:
${historial || 'Sin historial previo.'}

CUANDO CLASIFIQUES ENTREGA USA lead_updates.tipo_entrega EXACTAMENTE:
- recojo_trompillo
- yango_desde_trompillo
- delivery_normal
- departamento_provincia
- punto_rosa
- acumulado
También llena si aparece: direccion_entrega, ubicacion_entrega, ciudad_destino, departamento_destino, transportadora, estado_entrega.

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

CONFIGURACIÓN EDITABLE DE ENTREGA/PAGO DE ESTA TIENDA:
- TikTok/Live: ${iaConfig.tiktok || 'No configurado'}
- QR de pago/texto: ${iaConfig.qr_pago_texto || iaConfig.qr_texto || 'QR configurado por la tienda.'}
- Recojo principal: ${iaConfig.punto_recojo || 'Plaza El Trompillo'}
- Horario de recojo: ${iaConfig.horario_recojo || 'lunes de 4:00 p. m. a 5:00 p. m.'}
- Yango desde punto de recojo: ${iaConfig.yango_desde_trompillo || 'solo lunes desde Plaza El Trompillo para abaratar costo'}
- Delivery normal: ${iaConfig.delivery_normal || 'martes a viernes, pedir ubicación o dirección exacta'}
- Envíos a departamentos/provincias: ${iaConfig.envios_departamento || 'sí se hacen; se cobra 5 Bs por dejar en transportadora aparte del costo de la transportadora'}
- Costo despacho a transportadora: ${iaConfig.costo_despacho_transportadora || 5} Bs
- Punto Rosa/no recogió: ${iaConfig.punto_rosa || 'Si no recogió el lunes, las prendas pueden dejarse en Punto Rosa; Punto Rosa cobra resguardo por semana según bulto/bolsa y ya no depende de la tienda.'}

FLUJOS OBLIGATORIOS:
- NO digas reglas de entrega en el primer mensaje. Solo úsalas si la clienta pregunta o elige una forma de entrega.
- Si pregunta “dónde entregan”, “me anotas”, “recojo”, responde que el recojo es en Plaza El Trompillo lunes de 4:00 a 5:00 p. m. y marca tipo_entrega=recojo_trompillo.
- Si pide Yango desde la plaza o quiere que se lo envíen desde el Trompillo, explica que puede ser el lunes desde Plaza El Trompillo para abaratar costo y pide ubicación. Marca tipo_entrega=yango_desde_trompillo.
- Si pide delivery/Yango normal, pide ubicación o dirección exacta y referencia. Marca tipo_entrega=delivery_normal.
- Si pide departamento, provincia o interior, explica que sí se envía y que se cobran 5 Bs por dejar en transportadora, aparte de lo que cobre la transportadora. Pide poco a poco: nombre completo, ciudad/provincia/departamento, celular y transportadora preferida. Marca tipo_entrega=departamento_provincia.
- Si no recogió y pregunta por su pedido, responde que puede pasar a Punto Rosa y que Punto Rosa cobra por semana según el bulto/bolsa; no inventes monto. Marca tipo_entrega=punto_rosa si corresponde.
- Si pide QR/pagar/reservar, responde natural, indica que enviará el QR configurado y pide comprobante. Marca enviar_qr=true. No confirmes pago.

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

CUANDO CLASIFIQUES ENTREGA USA lead_updates.tipo_entrega EXACTAMENTE:
- recojo_trompillo
- yango_desde_trompillo
- delivery_normal
- departamento_provincia
- punto_rosa
- acumulado
También llena si aparece: direccion_entrega, ubicacion_entrega, ciudad_destino, departamento_destino, transportadora, estado_entrega.

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

CUANDO CLASIFIQUES ENTREGA USA lead_updates.tipo_entrega EXACTAMENTE:
- recojo_trompillo
- yango_desde_trompillo
- delivery_normal
- departamento_provincia
- punto_rosa
- acumulado
También llena si aparece: direccion_entrega, ubicacion_entrega, ciudad_destino, departamento_destino, transportadora, estado_entrega.

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

CUANDO CLASIFIQUES ENTREGA USA lead_updates.tipo_entrega EXACTAMENTE:
- recojo_trompillo
- yango_desde_trompillo
- delivery_normal
- departamento_provincia
- punto_rosa
- acumulado
También llena si aparece: direccion_entrega, ubicacion_entrega, ciudad_destino, departamento_destino, transportadora, estado_entrega.

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

  // V16.18: si quedó JSON mal cerrado tipo { "respuesta": "texto", ... extraer solo el valor.
  const loose = raw.match(/["']respuesta["']\s*:\s*["']([\s\S]*?)["']\s*(?:,|}|$)/i);
  if (loose) return loose[1].replace(/\\n/g, '\n').trim();

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
    lead_updates: parsed.lead_updates || parsed.lead || {},
    enviar_qr: Boolean(parsed.enviar_qr || parsed.enviarQR || parsed.send_qr),
    archivo: parsed.archivo || null
  };
}

function mockReply({ incomingText, lead, empresa }) {
  const rubro = normalizeRubro(empresa?.rubro || '');
  const text = String(incomingText || '').toLowerCase();
  const requires = ['asesor', 'humano', 'precio', 'costo', 'pago', 'qr', 'comprobante', 'reclamo'].some((x) => text.includes(x));
  if (rubro.includes('negocio_digital') || rubro.includes('digital') || rubro.includes('wordpress') || rubro.includes('hosting') || rubro.includes('chatflow')) {
    let respuesta = '👋 ¡Hola! Bienvenido a Fernando Web Studio. Aquí creamos páginas web profesionales, WordPress, hosting, correos corporativos, IA para WhatsApp y sistemas digitales para negocios. Cuéntame, ¿qué tipo de proyecto necesitas o qué te gustaría mejorar en tu negocio?';
    if (text.includes('promo') || text.includes('promocion') || text.includes('promoción') || text.includes('oferta')) respuesta = 'Sí 😊 Tenemos una promoción especial: página web profesional + hosting + dominio por 1500 Bs, y te regalamos 1 mes gratis de IA en WhatsApp. Para orientarte mejor, ¿qué tipo de negocio tienes?';
    if (text.includes('precio') || text.includes('costo') || text.includes('cuanto') || text.includes('cuánto')) respuesta = 'Depende de lo que necesites 😊 Si buscas un paquete completo, tenemos una promo de página web + hosting + dominio por 1500 Bs y 1 mes gratis de IA en WhatsApp. ¿Buscas página web, IA para WhatsApp o ambas cosas?';
    if (text.includes('pagina') || text.includes('página') || text.includes('web')) respuesta = 'Perfecto 😊 Podemos ayudarte con una página web profesional. ¿Qué tipo de negocio tienes y qué te gustaría mostrar: servicios, productos, catálogo o información de tu empresa?';
    if (text.includes('wordpress')) respuesta = 'Claro 😊 Podemos crear o rediseñar tu página en WordPress. Si buscas una web desde cero, también tenemos promo con hosting + dominio por 1500 Bs y 1 mes gratis de IA WhatsApp. ¿Ya tienes dominio y hosting?';
    if (text.includes('hosting') || text.includes('correo') || text.includes('dominio')) respuesta = 'Sí 😊 Podemos ayudarte con dominio, hosting y correos corporativos. Ahora tenemos promo de página web + hosting + dominio por 1500 Bs e incluye 1 mes gratis de IA en WhatsApp. ¿Ya tienes dominio comprado?';
    if (text.includes('ia') || text.includes('whatsapp') || text.includes('wasap')) respuesta = 'Sí 😊 Podemos poner una IA en tu WhatsApp para responder consultas, tomar datos y pasar a humano. La IA básica empieza desde 200 Bs mensuales, y si haces tu página con hosting + dominio por 1500 Bs te regalamos 1 mes gratis de IA. ¿Qué negocio tienes?';
    if (text.includes('cita') || text.includes('reunion') || text.includes('reunión') || text.includes('llamada')) respuesta = 'Perfecto 😊 ¿Qué día y hora te queda bien para una llamada corta con Fernando? Así te explica la promo y la mejor opción para tu negocio.';
    return { respuesta, requiere_asesor: requires, motivo_derivacion: requires ? 'Prospecto requiere revisión/cotización de Fernando.' : '', lead_updates: { estado: 'en_proceso', etapa: 'interesado', servicio_solicitado: 'servicios_digitales' } };
  }
  if (rubro.includes('fardo') || rubro.includes('ropa') || rubro.includes('tienda') || rubro.includes('live')) {
    const upd = { estado: 'en_proceso', etapa: 'interesado', servicio_solicitado: 'ropa' };
    let enviar_qr = false;
    let respuesta = '¡Hola! Soy el asistente de '+(empresa.nombre || 'American Style')+' 😊 ¿Vienes del live o buscas alguna prenda en especial? Puedes enviarme captura de la prenda que te gustó.';

    const wantsPago = ['qr','pago','pagar','transferencia','reservar','reservo','apartar','compro'].some(x => text.includes(x));
    const wantsDepto = ['departamento','provincia','interior','flota','transportadora','encomienda'].some(x => text.includes(x));
    const wantsYangoTrompillo = (text.includes('yango') || text.includes('delivery')) && (text.includes('trompillo') || text.includes('plaza'));
    const wantsDelivery = !wantsYangoTrompillo && ['delivery','yango','mandar','envia','envía','ubicacion','ubicación'].some(x => text.includes(x));
    const wantsRecojo = ['recojo','recoger','paso','plaza','trompillo','anotame','anótame','me anota'].some(x => text.includes(x));
    const noRecogio = ['no fui','no pude ir','no recogí','no recogi','punto rosa','donde esta mi pedido','dónde está mi pedido'].some(x => text.includes(x));

    if (text.includes('live') || text.includes('captura') || text.includes('mio') || text.includes('mío') || text.includes('quiero esa') || text.includes('quiero esta')) {
      respuesta = 'Perfecto bella 😊 Envíame la captura de la prenda o el número del live para que el equipo verifique disponibilidad y precio.';
    }
    if (text.includes('precio') || text.includes('cuanto') || text.includes('cuánto')) {
      respuesta = 'Claro bella 😊 Envíame captura de la prenda y el equipo verificará precio y disponibilidad.';
    }
    if (wantsRecojo) {
      upd.tipo_entrega = 'recojo_trompillo';
      upd.estado_entrega = 'pendiente_recojo';
      respuesta = 'Claro bella 😊 Te podemos anotar para recojo en la Plaza El Trompillo los lunes de 4:00 p. m. a 5:00 p. m. ¿Me confirmas tu nombre completo para anotarte?';
    }
    if (wantsYangoTrompillo) {
      upd.tipo_entrega = 'yango_desde_trompillo';
      upd.estado_entrega = 'pendiente_ubicacion';
      respuesta = 'Claro bella 😊 También podemos enviártelo por Yango desde la Plaza El Trompillo el lunes, así suele salir más económico. Envíame tu ubicación para anotarte.';
    } else if (wantsDelivery) {
      upd.tipo_entrega = 'delivery_normal';
      upd.estado_entrega = 'pendiente_ubicacion';
      respuesta = 'Claro bella 😊 Para delivery/Yango necesito que me mandes tu ubicación o dirección exacta con referencia. El equipo calcula el costo y coordina el envío.';
    }
    if (wantsDepto) {
      upd.tipo_entrega = 'departamento_provincia';
      upd.estado_entrega = 'pendiente_datos_envio';
      upd.costo_despacho_transportadora = 5;
      respuesta = 'Sí bella 😊 Hacemos envíos a departamentos y provincias. Se cobra 5 Bs por llevar tu pedido hasta la transportadora, aparte de lo que cobre la empresa de transporte. Para preparar tu envío, envíame tu nombre completo, ciudad/provincia de destino, celular y transportadora de preferencia.';
    }
    if (noRecogio) {
      upd.tipo_entrega = 'punto_rosa';
      upd.estado_entrega = 'disponible_punto_rosa';
      respuesta = 'Claro bella 😊 Si no pudiste asistir al recojo del lunes, tus prendas pueden dejarse en Punto Rosa. Ellos cobran el resguardo por semana según el bulto de la bolsa; ese cobro ya no depende de nosotros.';
    }
    if (wantsPago) {
      enviar_qr = true;
      respuesta = 'Claro bella 😊 Te paso el QR para reservar tu prenda. Cuando pagues, envíame el comprobante para que el equipo lo revise y confirme tu pedido.';
    }
    if (text.includes('comprobante')) {
      respuesta = 'Gracias bella, recibimos tu comprobante ✅ El equipo verificará el pago y preparará tu pedido. No te confirmo aún hasta que lo revisen.';
      upd.estado = 'comprobante_enviado';
      upd.requiere_asesor = true;
    }
    return { respuesta, requiere_asesor: requires, motivo_derivacion: requires ? 'Requiere verificación humana.' : '', enviar_qr, lead_updates: upd };
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
