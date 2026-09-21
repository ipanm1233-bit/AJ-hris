-- AJ HRIS: tahap pertama migrasi Firestore -> Supabase.
-- Jalankan melalui Supabase SQL Editor. Browser tidak pernah menerima
-- service-role key; seluruh akses aplikasi masuk melalui API Vercel.

create table if not exists public.attendance (
  id text primary key,
  nik text not null,
  nama text not null default '',
  tanggal date not null,
  scan_masuk time,
  scan_keluar time,
  cabang text not null default '',
  divisi text not null default '',
  jabatan text not null default '',
  sumber text not null default '',
  fingerprint_user_id text,
  fingerprint_emp_no text,
  fingerprint_no_id text,
  fingerprint_name text,
  auto_assign boolean not null default false,
  perlu_koreksi boolean not null default false,
  alasan_koreksi text not null default '',
  klasifikasi_scan text not null default '',
  late_penalty_waived boolean not null default false,
  late_penalty_note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_nik_tanggal_unique unique (nik, tanggal),
  constraint attendance_tanggal_reasonable check (tanggal between date '2020-01-01' and date '2100-12-31')
);

create index if not exists attendance_tanggal_idx
  on public.attendance (tanggal desc);
create index if not exists attendance_cabang_tanggal_idx
  on public.attendance (upper(cabang), tanggal desc);
create index if not exists attendance_divisi_tanggal_idx
  on public.attendance (upper(divisi), tanggal desc);
create index if not exists attendance_nik_tanggal_idx
  on public.attendance (nik, tanggal desc);
create index if not exists attendance_incomplete_idx
  on public.attendance (tanggal desc)
  where scan_masuk is null or scan_keluar is null;

alter table public.attendance enable row level security;
revoke all on table public.attendance from anon, authenticated;

create or replace function public.set_attendance_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at
before update on public.attendance
for each row execute function public.set_attendance_updated_at();

comment on table public.attendance is
  'Data absensi operasional AJ HRIS. Akses aplikasi hanya melalui API Vercel terautentikasi Firebase.';
