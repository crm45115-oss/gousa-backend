require('dotenv').config();

function requireEnv(name, { optional = false } = {}) {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Falta variable de entorno: ${name}`);
  }
  return value || '';
}

const whatsappProvider = (process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase();

const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  defaultEmpresaId: process.env.DEFAULT_EMPRESA_ID || '',

  whatsappProvider,
  metaVerifyToken: process.env.META_VERIFY_TOKEN || '',
  metaAccessToken: process.env.META_ACCESS_TOKEN || '',
  metaApiVersion: process.env.META_API_VERSION || 'v23.0',
  metaAppId: process.env.META_APP_ID || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaConfigId: process.env.META_CONFIG_ID || '',
  metaRedirectUri: process.env.META_REDIRECT_URI || '',
  phoneNumberId: process.env.PHONE_NUMBER_ID || '',

  evolutionApiUrl: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  evolutionDefaultCountryCode: process.env.EVOLUTION_DEFAULT_COUNTRY_CODE || '591',

  aiProvider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',

  // V16.28 - Cola Redis + Worker.
  // REDIS_URL vacío = modo seguro: procesa como antes, sin cola.
  redisUrl: process.env.REDIS_URL || '',
  queueEnabled: String(process.env.QUEUE_ENABLED || 'true').toLowerCase() !== 'false',
  queueName: process.env.QUEUE_NAME || 'chatflow360_messages',
  queueConcurrency: Math.max(1, Number(process.env.QUEUE_CONCURRENCY || 1)),
  queueRemoveOnComplete: Math.max(100, Number(process.env.QUEUE_REMOVE_ON_COMPLETE || 1000)),
  queueRemoveOnFail: Math.max(100, Number(process.env.QUEUE_REMOVE_ON_FAIL || 5000)),
  messageRetryLimit: Math.max(1, Number(process.env.MESSAGE_RETRY_LIMIT || 3)),
  messageRetryDelayMs: Math.max(1000, Number(process.env.MESSAGE_RETRY_DELAY_MS || 5000)),

  // V16.42 - Respuesta humana: espera corta para agrupar mensajes seguidos
  // y evitar que la IA conteste por palabra suelta.
  aiReplyDelayMs: Math.max(0, Number(process.env.AI_REPLY_DELAY_MS || 9000)),
  aiReplyDelayJitterMs: Math.max(0, Number(process.env.AI_REPLY_DELAY_JITTER_MS || 4000)),

  dashboardApiKey: process.env.DASHBOARD_API_KEY || ''
};

module.exports = { config };
