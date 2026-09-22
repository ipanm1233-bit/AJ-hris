-- AJ HRIS: migrasi bertahap Tracking Sales ke Supabase.
-- Akses hanya dari API Vercel menggunakan service-role; browser tidak diberi akses tabel.

create table if not exists public.sales_visits (
  id text primary key,
  sales_nik text not null default '', sales_nama text not null default '', cabang text not null default '',
  tanggal date not null, waktu_checkin text, waktu_checkout text,
  toko_outlet text not null default '', alamat_toko text not null default '', koordinat_gps text not null default '',
  lat double precision, lng double precision, status_kunjungan text not null default '',
  is_effective_call boolean not null default false, gambar_checkin text not null default '',
  catatan text not null default '', sumber text not null default '', perusahaan text not null default '',
  manual_gps_edited boolean not null default false, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint sales_visits_tanggal_reasonable check (tanggal between date '2020-01-01' and date '2100-12-31'),
  constraint sales_visits_lat_valid check (lat is null or lat between -90 and 90),
  constraint sales_visits_lng_valid check (lng is null or lng between -180 and 180)
);

create index if not exists sales_visits_sales_date_idx on public.sales_visits (sales_nik, tanggal desc);
create index if not exists sales_visits_branch_date_idx on public.sales_visits (upper(cabang), tanggal desc);
create index if not exists sales_visits_outlet_idx on public.sales_visits (lower(toko_outlet));

create table if not exists public.sales_odometer (
  id text primary key, sales_nik text not null, sales_nama text not null default '', cabang text not null default '',
  tanggal date not null, km_awal numeric, km_akhir numeric, jarak_odometer numeric, jarak_gps numeric,
  manual_jarak_gps numeric, is_manual_gps boolean not null default false, selisih numeric,
  start_gps text not null default '', end_gps text not null default '', start_nama text not null default '',
  end_nama text not null default '', start_type text not null default '', end_type text not null default '',
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_odometer_sales_date_unique unique (sales_nik, tanggal),
  constraint sales_odometer_tanggal_reasonable check (tanggal between date '2020-01-01' and date '2100-12-31')
);

create index if not exists sales_odometer_branch_date_idx on public.sales_odometer (upper(cabang), tanggal desc);

create or replace function public.set_sales_tracking_updated_at()
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

drop trigger if exists sales_visits_set_updated_at on public.sales_visits;
create trigger sales_visits_set_updated_at before update on public.sales_visits
for each row execute function public.set_sales_tracking_updated_at();
drop trigger if exists sales_odometer_set_updated_at on public.sales_odometer;
create trigger sales_odometer_set_updated_at before update on public.sales_odometer
for each row execute function public.set_sales_tracking_updated_at();

alter table public.sales_visits enable row level security;
alter table public.sales_odometer enable row level security;
revoke all on table public.sales_visits from anon, authenticated;
revoke all on table public.sales_odometer from anon, authenticated;

comment on table public.sales_visits is 'Kunjungan outlet Tracking Sales AJ HRIS; akses hanya melalui API Vercel.';
comment on table public.sales_odometer is 'Odometer dan override rute harian AJ HRIS; akses hanya melalui API Vercel.';
