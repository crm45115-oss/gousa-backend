require('dotenv').config();

function requireEnv(name, { optional = false } = {}) {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Falta variable de entorno: ${name}`);
  }
  return value || '';
}

const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  defaultEmpresaId: process.env.DEFAULT_EMPRESA_ID || '',

  metaVerifyToken: requireEnv('META_VERIFY_TOKEN'),
  metaAccessToken: requireEnv('META_ACCESS_TOKEN'),
  metaApiVersion: process.env.META_API_VERSION || 'v23.0',
  metaAppId: process.env.META_APP_ID || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaConfigId: process.env.META_CONFIG_ID || '',
  metaRedirectUri: process.env.META_REDIRECT_URI || '',
  phoneNumberId: process.env.PHONE_NUMBER_ID || '',

  aiProvider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',

  dashboardApiKey: process.env.DASHBOARD_API_KEY || ''
};

module.exports = { config };
