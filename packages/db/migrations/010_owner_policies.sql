-- Tizim so'rovlari (slug bo'yicha klonni topish, katalog, to'lov webhooklari, muddati o'tgan tarif) tenant
-- kontekstisiz, ilova ulanadigan ega roli bilan bajariladi. FORCE RLS esa egani ham cheklaydi, superuser
-- bo'lmagan boshqariladigan Postgres'da (RDS, Cloud SQL) bu so'rovlar bo'sh natija qaytarardi.
-- Yechim: ega roli uchun ruxsat beruvchi siyosat. withTenant() `SET ROLE aiclone_app` qiladi — u rolga bu
-- siyosat tegishli emas, shuning uchun tenant izolyatsiyasi o'zgarmaydi.
-- Keyingi migratsiyada yangi FORCE RLS jadvali qo'shilsa, unga ham shu siyosat kerak.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS system_owner ON %I', t);
    EXECUTE format('CREATE POLICY system_owner ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
  END LOOP;
END $$;
