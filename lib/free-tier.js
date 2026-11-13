'use strict';

/**
 * Anggaran free tier yang dipakai sebagai batas keras di aplikasi.
 *
 * Angka di bawah adalah plafon konservatif (bukan angka marketing) supaya
 * aplikasi tetap aman walau pemakaian harian naik. Ubah hanya jika paket
 * platform benar-benar berubah.
 */

const FREE_TIER_BUDGETS = Object.freeze({
  firestore: Object.freeze({
    readsPerDay: 50_000,
    writesPerDay: 20_000,
    deletesPerDay: 20_000,
    storedGiB: 1,
    egressGiBPerMonth: 10
  }),
  supabase: Object.freeze({
    databaseMiB: 500,
    egressGiBPerMonth: 5,
    storageMiB: 1_024
  }),
  vercel: Object.freeze({
    functionInvocationsPerMonth: 1_000_000,
    fastDataTransferGiBPerMonth: 100,
    buildMinutesPerMonth: 6_000
  }),
  googleAppsScript: Object.freeze({
    urlFetchCallsPerDay: 20_000,
    runtimeMinutesPerDay: 90
  }),
  gmailSmtp: Object.freeze({
    messagesPerDay: 500
  })
});

const FORM_INTEGRATION_LIMITS = Object.freeze({
  maxDefinitions: 200,
  maxFieldsPerForm: 100,
  maxAnswersPerSubmission: 200,
  maxPayloadBytes: 512 * 1_024,
  maxSubmissionsPerFormPerDay: 3_000,
  maxSubmissionsPerMinutePerForm: 120,
  maxImportBatch: 100,
  maxImportsPerHour: 60,
  maxInboxPageSize: 200,
  pruneKeepDays: 90,
  pruneMaxRowsPerRun: 500
});

const EMAIL_DAILY_LIMIT = 200;

function clampPageSize(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(FORM_INTEGRATION_LIMITS.maxInboxPageSize, Math.max(1, Math.floor(number)));
}

function clampBatchSize(value, max = FORM_INTEGRATION_LIMITS.maxImportBatch) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(max, Math.floor(number));
}

function withinDailyLimit(count, limit) {
  return Number(count) < Number(limit);
}

function estimatePayloadBytes(value) {
  try {
    return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function payloadWithinLimit(value, limit = FORM_INTEGRATION_LIMITS.maxPayloadBytes) {
  return estimatePayloadBytes(value) <= limit;
}

module.exports = {
  FREE_TIER_BUDGETS,
  FORM_INTEGRATION_LIMITS,
  EMAIL_DAILY_LIMIT,
  clampPageSize,
  clampBatchSize,
  withinDailyLimit,
  estimatePayloadBytes,
  payloadWithinLimit
};
