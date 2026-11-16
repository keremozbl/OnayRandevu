-- =============================================================================
-- 87_integrations — kuruma özel dış servis bağlantıları (WhatsApp Business)
-- =============================================================================
-- WhatsApp Business Platform (Meta Cloud API) entegrasyonu. Kurum kendi Meta
-- kimlik bilgisini panelden bağlar; hatırlatmalar o kurumun kendi WhatsApp
-- numarasından gider. Orta pakete (Ekip) ve üstüne açık — plan geçidi burada,
-- veritabanında zorlanır (CLAUDE.md kural 3: yetki RLS'te/DB'de, arayüzde değil).
--
-- SIR AYRI TABLODADIR (kural 9 deseni, tıbbi not gibi): access_token bir
-- paroladır. Postgres RLS satır seviyesindedir, sütun gizleyemez; bu yüzden
-- token `tenant_whatsapp_secret` tablosunda durur ve o tabloya `authenticated`a
-- HİÇBİR yetki verilmez — ne okunur ne yazılır. Yalnız `security definer`
-- fonksiyonlar (sahibi postgres, BYPASSRLS) ve servis rolü (worker) erişir.
-- Yapılandırma (telefon no kimliği, WABA kimliği, durum) sır değildir; üye onu
-- okur ki ayarlar ekranı bağlantı durumunu gösterebilsin.

-- -----------------------------------------------------------------------------
-- Yapılandırma — sır olmayan alanlar. Üye okur, yazma definer fonksiyonla.
-- -----------------------------------------------------------------------------
create table public.tenant_whatsapp (
  tenant_id       uuid primary key references public.tenants (id) on delete cascade,
  enabled         boolean not null default false,
  -- Meta Cloud API tanımlayıcıları (kimlik bilgisi değil, adres gibi).
  phone_number_id text,
  waba_id         text,
  -- Son başarılı test gönderiminin anı; null = henüz doğrulanmadı.
  verified_at     timestamptz,
  updated_at      timestamptz not null default now()
);

create trigger tenant_whatsapp_set_updated_at
  before update on public.tenant_whatsapp
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Sır — access_token. authenticated'a yetki YOK; yalnız definer fn + service_role.
-- -----------------------------------------------------------------------------
create table public.tenant_whatsapp_secret (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  access_token text not null,
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Plan geçidi — yalnız Ekip ve Zincir WhatsApp bağlayabilir.
-- -----------------------------------------------------------------------------
create or replace function private.whatsapp_plan_allows(_tenant uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_subscriptions s
     where s.tenant_id = _tenant
       and s.plan in ('ekip', 'zincir')
  );
$$;

revoke execute on function private.whatsapp_plan_allows(uuid) from public, anon;
-- Politikadan ya da başka definer fn'den çağrılabilsin diye authenticated'a da.
grant execute on function private.whatsapp_plan_allows(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Bağlama — kimlik bilgisini yazar. Kapıda İKİ koşul: çağıranın `settings.manage`
-- yetkisi VE kurumun planı. İkisi de DB'de; arayüzü atlayan bir istek de bu
-- kapıdan geçmek zorunda. Token ayrı tabloya yazılır.
-- -----------------------------------------------------------------------------
create or replace function public.set_whatsapp_integration(
  _tenant          uuid,
  _phone_number_id text,
  _access_token    text,
  _waba_id         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.allows('settings.manage', _tenant) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not private.whatsapp_plan_allows(_tenant) then
    return jsonb_build_object('ok', false, 'reason', 'plan_required');
  end if;
  if coalesce(btrim(_phone_number_id), '') = '' or coalesce(btrim(_access_token), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_fields');
  end if;

  insert into public.tenant_whatsapp (tenant_id, enabled, phone_number_id, waba_id, verified_at)
  values (_tenant, true, btrim(_phone_number_id), nullif(btrim(coalesce(_waba_id, '')), ''), null)
  on conflict (tenant_id) do update
    set enabled         = true,
        phone_number_id = excluded.phone_number_id,
        waba_id         = excluded.waba_id,
        verified_at     = null;  -- kimlik değişti; yeniden test gerekir

  insert into public.tenant_whatsapp_secret (tenant_id, access_token)
  values (_tenant, _access_token)
  on conflict (tenant_id) do update set access_token = excluded.access_token, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.set_whatsapp_integration(uuid, text, text, text) from public, anon;
grant execute on function public.set_whatsapp_integration(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Bağlantıyı kesme — token silinir, bağlantı kapanır. Yapılandırma satırı kalır
-- (phone_number_id'yi tekrar yazmaya gerek kalmasın) ama enabled=false.
-- -----------------------------------------------------------------------------
create or replace function public.disconnect_whatsapp(_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.allows('settings.manage', _tenant) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.tenant_whatsapp
     set enabled = false, verified_at = null
   where tenant_id = _tenant;

  delete from public.tenant_whatsapp_secret where tenant_id = _tenant;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.disconnect_whatsapp(uuid) from public, anon;
grant execute on function public.disconnect_whatsapp(uuid) to authenticated;
