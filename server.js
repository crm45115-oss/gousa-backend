const express = require('express');
const cors = require('cors');
const { config } = require('./src/env');
const { verifyMetaSignature, sendWhatsAppText } = require('./src/whatsapp');
const { processWebhookPayload, simulateIncomingMessage } = require('./src/processor');
const { supabase } = require('./src/supabaseClient');
const { exchangeCodeForToken, upsertIntegration, getIntegrationStatus } = require('./src/metaSignup');
const { getEmpresaByPhoneNumberId, saveConversation, upsertLead, saveWebhookLog } = require('./src/db');
const { onlyDigits } = require('./src/utils');

const app = express();

app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((x) => x.trim()) }));
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

function requireDashboardKey(req, res, next) {
  if (!config.dashboardApiKey) return next();
  const header = req.get('x-dashboard-api-key');
  if (header !== config.dashboardApiKey) {
    return res.status(401).json({ ok: false, error: 'DASHBOARD_API_KEY inválida o faltante.' });
  }
  next();
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    name: 'GO USA WhatsApp Webhook Backend',
    webhook_url: `${config.publicBaseUrl || 'https://TU-BACKEND'}/webhook`,
    health: '/health'
  });
});

app.get('/health', async (_req, res) => {
  const { error } = await supabase.from('empresas').select('id').limit(1);
  res.status(error ? 500 : 200).json({
    ok: !error,
    supabase: error ? error.message : 'ok',
    ai_provider: config.aiProvider,
    meta_api_version: config.metaApiVersion,
    embedded_signup: Boolean(config.metaAppId && config.metaConfigId)
  });
});

// 1) Verificación de webhook desde Meta.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.metaVerifyToken) {
    console.log('[WEBHOOK_VERIFIED]');
    return res.status(200).send(challenge);
  }
  console.warn('[WEBHOOK_VERIFY_FAILED]', { mode, token });
  return res.sendStatus(403);
});

// 2) Recepción de mensajes reales de WhatsApp.
app.post('/webhook', async (req, res) => {
  try {
    if (!verifyMetaSignature(req)) return res.sendStatus(403);

    // Responder rápido a Meta. El proceso se hace inmediatamente, pero no bloquea a Meta más de lo necesario.
    res.status(200).json({ ok: true, received: true });

    const result = await processWebhookPayload(req.body);
    console.log('[WEBHOOK_PROCESSED]', JSON.stringify(result));
  } catch (error) {
    console.error('[WEBHOOK_ERROR]', error);
    if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
  }
});

// Prueba local: simula un mensaje entrante sin esperar a Meta.
app.post('/api/simulate-message', requireDashboardKey, async (req, res) => {
  try {
    const phoneNumberId = req.body.phoneNumberId || config.phoneNumberId;
    const from = onlyDigits(req.body.from || req.body.telefono);
    const text = req.body.text || req.body.mensaje || 'Hola, quiero información';
    const name = req.body.name || req.body.nombre || 'Cliente Demo';
    const result = await simulateIncomingMessage({ phoneNumberId, from, name, text });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Enviar mensaje manual desde el dashboard y guardar como asesor.
app.post('/api/send-text', requireDashboardKey, async (req, res) => {
  try {
    const telefono = onlyDigits(req.body.to || req.body.telefono);
    const text = String(req.body.text || req.body.mensaje || '').trim();
    const phoneNumberId = req.body.phoneNumberId || config.phoneNumberId;
    if (!telefono || !text) return res.status(400).json({ ok: false, error: 'Falta telefono o mensaje.' });

    const empresa = await getEmpresaByPhoneNumberId(phoneNumberId);
    const lead = await upsertLead({ empresaId: empresa.id, telefono, waId: telefono, incomingText: text });
    const meta = await sendWhatsAppText({ to: telefono, text, phoneNumberId });
    const conv = await saveConversation({
      empresaId: empresa.id,
      leadId: lead.id,
      telefono,
      rol: 'asesor',
      mensaje: text,
      tipo: 'text',
      metadata: { sent_from_dashboard: true, meta }
    });
    await saveWebhookLog({ empresaId: empresa.id, leadId: lead.id, evento: 'dashboard_send_text', payload: { telefono, text, meta }, estado: 'ok' });
    res.json({ ok: true, meta, conversation: conv });
  } catch (error) {
    console.error('[api/send-text]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});



// ==============================
// V15: Embedded Signup / SaaS multiempresa
// ==============================
app.get('/api/meta/config', requireDashboardKey, (_req, res) => {
  res.json({
    ok: true,
    app_id: config.metaAppId || '',
    config_id: config.metaConfigId || '',
    api_version: config.metaApiVersion,
    redirect_uri: config.metaRedirectUri || `${config.publicBaseUrl}/meta/callback`,
    webhook_url: `${config.publicBaseUrl}/webhook`,
    ready: Boolean(config.metaAppId && config.metaAppSecret && config.metaConfigId)
  });
});

// Pantalla simple por si Meta redirige a callback. En el flujo JS normalmente se usa /api/meta/embedded-signup.
app.get('/meta/callback', (req, res) => {
  const code = req.query.code || '';
  const state = req.query.state || '';
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>GO USA Meta Callback</title></head><body style="font-family:Arial;padding:24px"><h2>Meta devolvió autorización</h2><p>Copia el code en el panel si no se cerró automático.</p><textarea style="width:100%;height:130px">${String(code).replace(/</g,'&lt;')}</textarea><p>state: ${String(state).replace(/</g,'&lt;')}</p></body></html>`);
});

// Recibe el resultado de Embedded Signup o conexión manual del cliente.
app.post('/api/meta/embedded-signup', requireDashboardKey, async (req, res) => {
  try {
    const empresaId = req.body.empresa_id || req.body.empresaId || config.defaultEmpresaId;
    const code = req.body.code || '';
    const accessTokenManual = req.body.access_token || req.body.accessToken || '';
    const accessToken = accessTokenManual || await exchangeCodeForToken({ code, redirectUri: req.body.redirect_uri });

    const integration = await upsertIntegration({
      empresaId,
      businessId: req.body.business_id || req.body.businessId,
      wabaId: req.body.waba_id || req.body.wabaId,
      phoneNumberId: req.body.phone_number_id || req.body.phoneNumberId,
      displayPhoneNumber: req.body.display_phone_number || req.body.displayPhoneNumber,
      accessToken,
      tokenTipo: code ? 'embedded_signup_code' : 'manual_or_client_token',
      pagoMetaEstado: req.body.pago_meta_estado || req.body.pagoMetaEstado || 'pendiente',
      metadata: {
        source: 'api_meta_embedded_signup',
        raw_body: { ...req.body, access_token: accessToken ? '[REDACTED]' : undefined, accessToken: undefined }
      }
    });

    res.json({ ok: true, integration });
  } catch (error) {
    console.error('[api/meta/embedded-signup]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Atajo manual para instalar un cliente mientras Embedded Signup queda aprobado/configurado.
app.post('/api/meta/manual-connect', requireDashboardKey, async (req, res) => {
  try {
    const integration = await upsertIntegration({
      empresaId: req.body.empresa_id || req.body.empresaId || config.defaultEmpresaId,
      businessId: req.body.business_id || req.body.businessId,
      wabaId: req.body.waba_id || req.body.wabaId,
      phoneNumberId: req.body.phone_number_id || req.body.phoneNumberId,
      displayPhoneNumber: req.body.display_phone_number || req.body.displayPhoneNumber,
      accessToken: req.body.access_token || req.body.accessToken,
      tokenTipo: 'manual_cliente',
      pagoMetaEstado: req.body.pago_meta_estado || req.body.pagoMetaEstado || 'cliente_meta',
      metadata: { source: 'manual_connect' }
    });
    res.json({ ok: true, integration });
  } catch (error) {
    console.error('[api/meta/manual-connect]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/empresa/:empresaId/whatsapp-status', requireDashboardKey, async (req, res) => {
  try {
    const integrations = await getIntegrationStatus(req.params.empresaId);
    res.json({ ok: true, integrations });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Lectura simple para dashboard externo si no quieres leer directo desde Supabase.
app.get('/api/bootstrap', requireDashboardKey, async (req, res) => {
  try {
    const phoneNumberId = req.query.phoneNumberId || config.phoneNumberId;
    const empresa = await getEmpresaByPhoneNumberId(phoneNumberId);
    const [leads, conversaciones, citas, iaConfig, servicios] = await Promise.all([
      supabase.from('leads').select('*').eq('empresa_id', empresa.id).order('ultima_interaccion', { ascending: false }).limit(200),
      supabase.from('conversaciones').select('*').eq('empresa_id', empresa.id).order('created_at', { ascending: false }).limit(500),
      supabase.from('citas').select('*').eq('empresa_id', empresa.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('ia_config').select('*').eq('empresa_id', empresa.id).maybeSingle(),
      supabase.from('servicios').select('*').eq('empresa_id', empresa.id).eq('activo', true)
    ]);

    for (const result of [leads, conversaciones, citas, iaConfig, servicios]) {
      if (result.error) throw result.error;
    }

    res.json({
      ok: true,
      empresa,
      leads: leads.data || [],
      conversaciones: conversaciones.data || [],
      citas: citas.data || [],
      ia_config: iaConfig.data || null,
      servicios: servicios.data || []
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada.' }));

app.listen(config.port, () => {
  console.log(`GO USA Webhook Backend activo en puerto ${config.port}`);
  console.log(`Webhook Meta: ${config.publicBaseUrl || 'https://TU-BACKEND'}/webhook`);
});
