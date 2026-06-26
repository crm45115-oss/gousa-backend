const { config } = require('./env');
const { supabase } = require('./supabaseClient');

function cleanText(value) {
  return String(value || '').trim();
}

async function exchangeCodeForToken({ code, redirectUri }) {
  if (!code) return null;
  if (!config.metaAppId) throw new Error('Falta META_APP_ID.');
  if (!config.metaAppSecret) throw new Error('Falta META_APP_SECRET.');

  const uri = redirectUri || config.metaRedirectUri || `${config.publicBaseUrl}/meta/callback`;
  const params = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    redirect_uri: uri,
    code
  });

  const url = `https://graph.facebook.com/${config.metaApiVersion}/oauth/access_token?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `No se pudo intercambiar code por token. HTTP ${response.status}`);
  }
  return data.access_token || null;
}

async function debugToken(accessToken) {
  if (!accessToken || !config.metaAccessToken) return null;
  const appAccessToken = `${config.metaAppId}|${config.metaAppSecret}`;
  const params = new URLSearchParams({ input_token: accessToken, access_token: appAccessToken });
  const response = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/debug_token?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  return data;
}

async function getPhoneNumberInfo(phoneNumberId, accessToken) {
  if (!phoneNumberId || !accessToken) return null;
  const fields = 'id,display_phone_number,verified_name,quality_rating,platform_type,throughput';
  const url = `https://graph.facebook.com/${config.metaApiVersion}/${phoneNumberId}?fields=${encodeURIComponent(fields)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: data?.error?.message || `HTTP ${response.status}`, raw: data };
  return data;
}

async function upsertIntegration({
  empresaId,
  businessId,
  wabaId,
  phoneNumberId,
  displayPhoneNumber,
  accessToken,
  tokenTipo = 'embedded_signup',
  pagoMetaEstado = 'pendiente',
  metadata = {}
}) {
  const empresa_id = cleanText(empresaId);
  const phone_number_id = cleanText(phoneNumberId);
  if (!empresa_id) throw new Error('Falta empresa_id.');
  if (!phone_number_id) throw new Error('Falta phone_number_id.');

  const phoneInfo = accessToken ? await getPhoneNumberInfo(phone_number_id, accessToken).catch((err) => ({ error: err.message })) : null;
  const display = displayPhoneNumber || phoneInfo?.display_phone_number || '';

  const payload = {
    empresa_id,
    business_id: cleanText(businessId) || null,
    waba_id: cleanText(wabaId) || null,
    phone_number_id,
    display_phone_number: cleanText(display),
    access_token: accessToken || null,
    token_tipo: tokenTipo,
    estado: accessToken ? 'conectado' : 'pendiente',
    pago_meta_estado: pagoMetaEstado,
    permisos: {},
    metadata: { ...metadata, phone_info: phoneInfo || null },
    conectado_en: accessToken ? new Date().toISOString() : null,
    ultimo_error: phoneInfo?.error || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('whatsapp_integraciones')
    .upsert(payload, { onConflict: 'phone_number_id' })
    .select('*')
    .single();
  if (error) throw error;

  const { error: empresaError } = await supabase
    .from('empresas')
    .update({
      business_id: payload.business_id,
      whatsapp_business_account_id: payload.waba_id,
      whatsapp_phone_number_id: payload.phone_number_id,
      whatsapp: payload.display_phone_number || undefined,
      estado_whatsapp: payload.estado,
      meta_pago_estado: payload.pago_meta_estado,
      onboarding_estado: payload.estado === 'conectado' ? 'whatsapp_conectado' : 'pendiente',
      webhook_backend: 'propio',
      webhook_url: `${config.publicBaseUrl}/webhook`,
      updated_at: new Date().toISOString()
    })
    .eq('id', empresa_id);
  if (empresaError) throw empresaError;

  await supabase.from('meta_onboarding_logs').insert({
    empresa_id,
    evento: 'whatsapp_integracion_upsert',
    payload: { ...payload, access_token: payload.access_token ? '[REDACTED]' : null },
    estado: payload.estado
  });

  return data;
}

async function getIntegrationStatus(empresaId) {
  const { data, error } = await supabase
    .from('whatsapp_integraciones')
    .select('id,empresa_id,business_id,waba_id,phone_number_id,display_phone_number,token_tipo,estado,pago_meta_estado,conectado_en,ultimo_error,created_at,updated_at')
    .eq('empresa_id', empresaId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = { exchangeCodeForToken, debugToken, upsertIntegration, getIntegrationStatus };
