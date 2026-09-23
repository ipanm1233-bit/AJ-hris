'use strict';

const { supabaseRequest } = require('./supabase.js');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const text = value => String(value || '').trim();
const numberOrNull = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);

function visitToSupabase(row = {}) {
  const id = text(row.id || row._docId).slice(0, 220);
  const tanggal = text(row.tanggal);
  if (!id || !DATE_RE.test(tanggal)) throw new Error('Kunjungan sales memerlukan ID dan tanggal valid.');
  return {
    id,
    sales_nik: text(row.sales_nik),
    sales_nama: text(row.sales_nama),
    cabang: text(row.cabang).toUpperCase(),
    tanggal,
    waktu_checkin: text(row.waktu_checkin).slice(0, 40) || null,
    waktu_checkout: text(row.waktu_checkout).slice(0, 40) || null,
    toko_outlet: text(row.toko_outlet),
    alamat_toko: text(row.alamat_toko),
    koordinat_gps: text(row.koordinat_gps),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    status_kunjungan: text(row.status_kunjungan),
    is_effective_call: row.is_effective_call === true,
    gambar_checkin: text(row.gambar_checkin || row.foto_checkin || row.foto),
    catatan: text(row.catatan),
    sumber: text(row.sumber),
    perusahaan: text(row.perusahaan),
    manual_gps_edited: row.manual_gps_edited === true,
    payload: row
  };
}

function visitFromSupabase(row = {}) {
  return {
    ...(row.payload && typeof row.payload === 'object' ? row.payload : {}),
    id: row.id, _docId: row.id,
    sales_nik: row.sales_nik, sales_nama: row.sales_nama, cabang: row.cabang,
    tanggal: row.tanggal, waktu_checkin: row.waktu_checkin, waktu_checkout: row.waktu_checkout,
    toko_outlet: row.toko_outlet, alamat_toko: row.alamat_toko, koordinat_gps: row.koordinat_gps,
    lat: row.lat, lng: row.lng, status_kunjungan: row.status_kunjungan,
    is_effective_call: row.is_effective_call, gambar_checkin: row.gambar_checkin,
    catatan: row.catatan, sumber: row.sumber, perusahaan: row.perusahaan,
    manual_gps_edited: row.manual_gps_edited
  };
}

function odometerToSupabase(row = {}) {
  const salesNik = text(row.sales_nik);
  const tanggal = text(row.tanggal);
  if (!salesNik || !DATE_RE.test(tanggal)) throw new Error('Odometer memerlukan NIK sales dan tanggal valid.');
  return {
    id: text(row.id || `ODM-${salesNik}-${tanggal}`).slice(0, 220),
    sales_nik: salesNik,
    sales_nama: text(row.sales_nama),
    cabang: text(row.cabang).toUpperCase(),
    tanggal,
    km_awal: numberOrNull(row.km_awal), km_akhir: numberOrNull(row.km_akhir),
    jarak_odometer: numberOrNull(row.jarak_odometer), jarak_gps: numberOrNull(row.jarak_gps),
    manual_jarak_gps: numberOrNull(row.manual_jarak_gps), is_manual_gps: row.is_manual_gps === true,
    selisih: numberOrNull(row.selisih), start_gps: text(row.start_gps), end_gps: text(row.end_gps),
    start_nama: text(row.start_nama), end_nama: text(row.end_nama),
    start_type: text(row.start_type), end_type: text(row.end_type), payload: row
  };
}

function odometerFromSupabase(row = {}) {
  return {
    ...(row.payload && typeof row.payload === 'object' ? row.payload : {}),
    id: row.id, _docId: row.id, sales_nik: row.sales_nik, sales_nama: row.sales_nama,
    cabang: row.cabang, tanggal: row.tanggal, km_awal: row.km_awal, km_akhir: row.km_akhir,
    jarak_odometer: row.jarak_odometer, jarak_gps: row.jarak_gps,
    manual_jarak_gps: row.manual_jarak_gps, is_manual_gps: row.is_manual_gps,
    selisih: row.selisih, start_gps: row.start_gps, end_gps: row.end_gps,
    start_nama: row.start_nama, end_nama: row.end_nama,
    start_type: row.start_type, end_type: row.end_type
  };
}

function filtersQuery(filters = {}) {
  const query = { select: '*' };
  if (filters.fromDate && filters.toDate) query.and = `(tanggal.gte.${filters.fromDate},tanggal.lte.${filters.toDate})`;
  else if (filters.fromDate) query.tanggal = `gte.${filters.fromDate}`;
  else if (filters.toDate) query.tanggal = `lte.${filters.toDate}`;
  if (filters.nik) query.sales_nik = `eq.${filters.nik}`;
  if (filters.branch) query.cabang = `eq.${text(filters.branch).toUpperCase()}`;
  query.order = 'tanggal.desc';
  query.limit = Math.min(10000, Math.max(1, Number(filters.limit || 5000)));
  return query;
}

async function listSalesVisits(filters = {}, options = {}) {
  const rows = await supabaseRequest('sales_visits', { query: filtersQuery(filters), ...options });
  return (rows || []).map(visitFromSupabase);
}

async function getSalesVisitsByIds(ids, options = {}) {
  const values = [...new Set((ids || []).map(text).filter(Boolean))];
  if (!values.length) return [];
  const rows = await supabaseRequest('sales_visits', {
    query: { select: '*', id: `in.(${values.map(value => `"${value.replace(/["\\]/g, '')}"`).join(',')})` },
    ...options
  });
  return (rows || []).map(visitFromSupabase);
}

async function upsertSalesVisits(rows, options = {}) {
  const body = (Array.isArray(rows) ? rows : [rows]).map(visitToSupabase);
  if (!body.length) return [];
  return supabaseRequest('sales_visits', { method: 'POST', query: { on_conflict: 'id' }, prefer: 'resolution=merge-duplicates,return=representation', body, ...options });
}

async function deleteSalesVisits(ids, options = {}) {
  const values = [...new Set((ids || []).map(text).filter(Boolean))];
  if (!values.length) return [];
  return supabaseRequest('sales_visits', { method: 'DELETE', query: { id: `in.(${values.map(value => `"${value.replace(/["\\]/g, '')}"`).join(',')})`, select: 'id' }, prefer: 'return=representation', ...options });
}

async function listSalesOdometers(filters = {}, options = {}) {
  const rows = await supabaseRequest('sales_odometer', { query: filtersQuery(filters), ...options });
  return (rows || []).map(odometerFromSupabase);
}

async function upsertSalesOdometers(rows, options = {}) {
  const body = (Array.isArray(rows) ? rows : [rows]).map(odometerToSupabase);
  if (!body.length) return [];
  return supabaseRequest('sales_odometer', { method: 'POST', query: { on_conflict: 'sales_nik,tanggal' }, prefer: 'resolution=merge-duplicates,return=representation', body, ...options });
}

module.exports = { visitToSupabase, visitFromSupabase, odometerToSupabase, odometerFromSupabase, listSalesVisits, getSalesVisitsByIds, upsertSalesVisits, deleteSalesVisits, listSalesOdometers, upsertSalesOdometers };
