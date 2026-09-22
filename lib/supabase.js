'use strict';

function cleanBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    throw new Error('SUPABASE_URL harus berupa URL HTTPS proyek Supabase.');
  }
  return url.toString().replace(/\/+$/, '');
}

function getSupabaseConfig(env = process.env) {
  const url = cleanBaseUrl(env.SUPABASE_URL);
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) return null;
  if (serviceRoleKey.length < 40) throw new Error('SUPABASE_SERVICE_ROLE_KEY tidak valid.');
  return { url, serviceRoleKey };
}

function supabaseEnabled(env = process.env) {
  return String(env.ATTENDANCE_DB_PROVIDER || '').trim().toLowerCase() === 'supabase' && Boolean(getSupabaseConfig(env));
}

function salesTrackingSupabaseEnabled(env = process.env) {
  return String(env.SALES_TRACKING_DB_PROVIDER || '').trim().toLowerCase() === 'supabase' && Boolean(getSupabaseConfig(env));
}

function encodeQuery(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function supabaseRequest(path, options = {}) {
  const config = getSupabaseConfig(options.env || process.env);
  if (!config) throw new Error('Supabase belum dikonfigurasi.');
  const response = await (options.fetchImpl || fetch)(`${config.url}/rest/v1/${path}${encodeQuery(options.query)}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.prefer ? { prefer: options.prefer } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 25_000)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(`Supabase: ${message}`);
  }
  return data;
}

module.exports = { cleanBaseUrl, getSupabaseConfig, supabaseEnabled, salesTrackingSupabaseEnabled, encodeQuery, supabaseRequest };
