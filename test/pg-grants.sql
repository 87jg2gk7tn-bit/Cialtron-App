grant select,insert,update,delete on all tables in schema public to app, authenticated;
grant execute on all functions in schema public to app, authenticated;
-- anon come su Supabase: può chiamare le funzioni, e le tabelle le vede solo
-- attraverso quelle. I revoke di supabase.sql restringono poi il resto.
grant execute on all functions in schema public to anon;
