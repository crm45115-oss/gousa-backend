const { createClient } = require('@supabase/supabase-js');
const { config } = require('./env');

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

module.exports = { supabase };
