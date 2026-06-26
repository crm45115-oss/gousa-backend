const express = require('express');
const cors = require('cors');
const { config } = require('./src/env');
const { verifyMetaSignature, sendWhatsAppText } = require('./src/whatsapp');
const { processWebhookPayload, simulateIncomingMessage } = require('./src/processor');
const { supabase } = require('./src/supabaseClient');
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
    meta_api_version: config.metaApiVersion
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
