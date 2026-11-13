-- AJ HRIS: integrasi Google Form + rate limiter terdistribusi.
-- Jalankan SATU KALI melalui Supabase SQL Editor. Browser tidak pernah
-- menerima service-role key; seluruh akses masuk melalui API Vercel.
--
-- Desain hemat free tier:
--  * Formulir HRIS tetap menjadi sumber kebenaran di Firestore.
--  * Supabase hanya menyimpan definisi integrasi, respons mentah Google Form,
--    dan penghitung rate limit (baris kecil, tanpa file/gambar).
--  * Tidak ada Supabase Auth. Semua akses admin memakai token Firebase.
--  * Respons Google Form bersifat idempoten berdasarkan submission_id.

-- ---------------------------------------------------------------------------
-- 1. Penghitung rate limit terdistribusi (fixed window)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_buckets (
  namespace text not null,
  bucket_key text not null,
  hits integer not null default 0,
  window_start timestamptz not null default now(),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (namespace, bucket_key),
  constraint rate_limit_namespace_len check (length(namespace) between 1 and 80),
  constraint rate_limit_key_len check (length(bucket_key) between 1 and 200)
);

create index if not exists rate_limit_reset_at_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_namespace text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.rate_limit_buckets%rowtype;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Parameter rate limit tidak valid.';
  end if;

  insert into public.rate_limit_buckets (namespace, bucket_key, hits, window_start, reset_at, updated_at)
  values (p_namespace, p_key, 1, v_now, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (namespace, bucket_key) do update
    set hits = case
          when public.rate_limit_buckets.reset_at <= v_now then 1
          else public.rate_limit_buckets.hits + 1
        end,
        window_start = case
          when public.rate_limit_buckets.reset_at <= v_now then v_now
          else public.rate_limit_buckets.window_start
        end,
        reset_at = case
          when public.rate_limit_buckets.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
          else public.rate_limit_buckets.reset_at
        end,
        updated_at = v_now
  returning * into v_row;

  return query
    select v_row.hits <= p_limit,
           greatest(p_limit - v_row.hits, 0),
           v_row.reset_at;
end;
$$;

create or replace function public.prune_rate_limit_buckets(
  p_before timestamptz default (now() - interval '1 day')
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_buckets where reset_at < p_before;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Definisi integrasi per formulir HRIS
-- ---------------------------------------------------------------------------
create table if not exists public.form_definitions (
  id text primary key,
  nama_form text not null default '',
  google_form_id text not null default '',
  google_form_url text not null default '',
  field_map jsonb not null default '[]'::jsonb,
  schema_fields jsonb not null default '[]'::jsonb,
  webhook_secret text not null default '',
  active boolean not null default true,
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_definition_id_len check (length(id) between 3 and 120),
  constraint form_definition_name_len check (length(nama_form) between 1 and 200),
  constraint form_definition_secret_len check (length(webhook_secret) between 0 and 200),
  constraint form_definition_map_array check (jsonb_typeof(field_map) = 'array'),
  constraint form_definition_schema_array check (jsonb_typeof(schema_fields) = 'array')
);

create index if not exists form_definitions_active_idx
  on public.form_definitions (active, updated_at desc);

alter table public.form_definitions enable row level security;
revoke all on table public.form_definitions from anon, authenticated;

create or replace function public.set_form_definition_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists form_definitions_set_updated_at on public.form_definitions;
create trigger form_definitions_set_updated_at
  before update on public.form_definitions
  for each row execute function public.set_form_definition_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Respons Google Form (idempoten berdasarkan submission_id Google)
-- ---------------------------------------------------------------------------
create table if not exists public.form_submissions (
  id text primary key,
  form_id text not null references public.form_definitions(id) on delete cascade,
  google_form_id text not null default '',
  submitted_at timestamptz not null default now(),
  respondent_email text not null default '',
  respondent_name text not null default '',
  answers jsonb not null default '[]'::jsonb,
  mapped jsonb not null default '{}'::jsonb,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'IMPORTED', 'REJECTED', 'ERROR')),
  imported_id text not null default '',
  import_error text not null default '',
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint form_submission_id_len check (length(id) between 1 and 200),
  constraint form_submission_email_len check (length(respondent_email) <= 320)
);

create index if not exists form_submissions_form_received_idx
  on public.form_submissions (form_id, received_at desc);
create index if not exists form_submissions_status_idx
  on public.form_submissions (status, received_at desc);
create index if not exists form_submissions_received_idx
  on public.form_submissions (received_at desc);

alter table public.form_submissions enable row level security;
revoke all on table public.form_submissions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hak akses service role (API Vercel)
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;
grant select, insert, update, delete on table public.form_definitions to service_role;
grant select, insert, update, delete on table public.form_submissions to service_role;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.prune_rate_limit_buckets(timestamptz) to service_role;

comment on table public.form_definitions is
  'Definisi integrasi Google Form per formulir HRIS. Berisi kunci webhook; hanya dibaca API server.';
comment on table public.form_submissions is
  'Kotak masuk respons Google Form. Diimpor ke Firestore data_pengajuan secara idempoten.';
comment on table public.rate_limit_buckets is
  'Penghitung rate limit terdistribusi agar kuota free tier tidak jebol.';
