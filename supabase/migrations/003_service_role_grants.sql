-- AJ HRIS: pastikan API Vercel dengan Supabase Secret key dapat membaca
-- dan menulis tabel migrasi. RLS tetap aktif untuk anon/authenticated;
-- browser tidak menerima akses langsung ke tabel ini.

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.attendance to service_role;
grant select, insert, update, delete on table public.sales_visits to service_role;
grant select, insert, update, delete on table public.sales_odometer to service_role;

-- Tegaskan kembali bahwa key publik tidak boleh mengakses data operasional.
revoke all on table public.attendance from anon, authenticated;
revoke all on table public.sales_visits from anon, authenticated;
revoke all on table public.sales_odometer from anon, authenticated;
