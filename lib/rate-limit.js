'use strict';

/**
 * Rate limiter dua lapis:
 *  1. Memori proses (cepat, tanpa biaya) — selalu aktif.
 *  2. Penghitung terdistribusi di Supabase (opsional) — mencegah bypass saat
 *     Vercel menjalankan banyak instance function.
 *
 * Lapisan Supabase hanya dipakai untuk endpoint berisiko (webhook publik,
 * login, impor massal). Endpoint baca biasa tetap memakai memori agar tidak
 * menambah egress/kuota database free tier.
 */

const { supabaseRequest } = require('./supabase.js');

const MEMORY_BUCKET_LIMIT = 20_000;
const memoryBuckets = new Map();

function normalizeKey(value) {
  return String(value || 'unknown').trim().slice(0, 200) || 'unknown';
}

function pruneMemoryBuckets(now = Date.now()) {
  if (memoryBuckets.size <= MEMORY_BUCKET_LIMIT) return 0;
  let removed = 0;
  for (const [key, bucket] of memoryBuckets) {
    if (!bucket || bucket.resetAt <= now) {
      memoryBuckets.delete(key);
      removed += 1;
    }
  }
  if (memoryBuckets.size > MEMORY_BUCKET_LIMIT) {
    const overflow = memoryBuckets.size - MEMORY_BUCKET_LIMIT;
    let index = 0;
    for (const key of memoryBuckets.keys()) {
      if (index >= overflow) break;
      memoryBuckets.delete(key);
      index += 1;
      removed += 1;
    }
  }
  return removed;
}

function consumeMemoryBucket(options = {}) {
  const namespace = normalizeKey(options.namespace || 'default');
  const key = normalizeKey(options.key);
  const limit = Math.max(1, Number(options.limit) || 1);
  const windowMs = Math.max(1_000, Number(options.windowMs) || 60_000);
  const now = Number(options.now) || Date.now();
  const bucketKey = `${namespace}:${key}`;

  pruneMemoryBuckets(now);

  const previous = memoryBuckets.get(bucketKey);
  const bucket = !previous || previous.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : previous;

  bucket.count += 1;
  memoryBuckets.set(bucketKey, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    limit
  };
}

async function consumeDistributedBucket(options = {}, deps = {}) {
  const namespace = normalizeKey(options.namespace || 'default');
  const key = normalizeKey(options.key);
  const limit = Math.max(1, Number(options.limit) || 1);
  const windowSeconds = Math.max(1, Math.ceil((Number(options.windowMs) || 60_000) / 1000));
  const request = deps.request || supabaseRequest;

  const result = await request('rpc/consume_rate_limit', {
    method: 'POST',
    body: {
      p_namespace: namespace,
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds
    },
    timeoutMs: options.timeoutMs || 4_000,
    fetchImpl: deps.fetchImpl,
    env: options.env
  });

  const row = Array.isArray(result) ? result[0] : result;
  if (!row || typeof row.allowed !== 'boolean') {
    throw new Error('Respons rate limit Supabase tidak valid.');
  }
  const resetAt = row.reset_at ? new Date(row.reset_at).getTime() : Date.now() + windowSeconds * 1000;
  return {
    allowed: row.allowed,
    remaining: Math.max(0, Number(row.remaining) || 0),
    resetAt: Number.isFinite(resetAt) ? resetAt : Date.now() + windowSeconds * 1000,
    limit
  };
}

async function pruneRateLimitBuckets(options = {}, deps = {}) {
  const request = deps.request || supabaseRequest;
  const before = options.before || new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  return request('rpc/prune_rate_limit_buckets', {
    method: 'POST',
    body: { p_before: before },
    timeoutMs: options.timeoutMs || 5_000,
    fetchImpl: deps.fetchImpl,
    env: options.env
  });
}

function resetMemoryBuckets() {
  memoryBuckets.clear();
}

module.exports = {
  MEMORY_BUCKET_LIMIT,
  consumeMemoryBucket,
  consumeDistributedBucket,
  pruneRateLimitBuckets,
  pruneMemoryBuckets,
  resetMemoryBuckets
};
