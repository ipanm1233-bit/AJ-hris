-- Jalankan satu kali di Supabase SQL Editor sebelum memakai pemetaan manual.
create table if not exists public.fingerprint_mappings (
  id uuid primary key default gen_random_uuid(),
  cabang text not null,
  emp_no text not null,
  no_id text not null,
  finger_name text not null,
  nik text not null,
  nama_karyawan text not null,
  effective_from date not null,
  effective_to date,
  reason text not null,
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_by text,
  revoked_at timestamptz,
  constraint fingerprint_mapping_period check (effective_to is null or effective_to >= effective_from),
  constraint fingerprint_mapping_branch check (length(trim(cabang)) between 2 and 50),
  constraint fingerprint_mapping_ids check (length(trim(emp_no)) between 1 and 60 and length(trim(no_id)) between 1 and 60),
  constraint fingerprint_mapping_reason check (length(trim(reason)) >= 10)
);

create index if not exists fingerprint_mappings_active_idx
  on public.fingerprint_mappings (cabang, emp_no, effective_from)
  where active;

alter table public.fingerprint_mappings enable row level security;
revoke all on table public.fingerprint_mappings from anon, authenticated;
grant select, insert, update on table public.fingerprint_mappings to service_role;

comment on table public.fingerprint_mappings is
  'Pemetaan manual HRD untuk identitas mesin. Sidik jari tidak disimpan di HRIS.';
