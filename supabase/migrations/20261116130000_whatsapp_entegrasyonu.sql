-- WhatsApp Business (Meta Cloud API) entegrasyonu — kuruma özel bağlantı.
-- Kaynak: schemas/80_notifications.sql (şablon kolonları), schemas/87_integrations.sql
-- (tablolar + fonksiyonlar), schemas/90_rls.sql (RLS). Yalnız DEĞİŞİKLİK.

-- 1) Onaylı WhatsApp şablonu alanları (message_templates).
alter table public.message_templates
  add column if not exists provider_template_name text;
alter table public.message_templates
  add column if not exists provider_template_lang text not null default 'tr';

-- 2) Yapılandırma tablosu (sır değil).
create table if not exists public.tenant_whatsapp (
  tenant_id       uuid primary key references public.tenants (id) on delete cascade,
  enabled         boolean not null default false,
  phone_number_id text,
  waba_id         text,
  verified_at     timestamptz,
  updated_at      timestamptz not null default now()
);

drop trigger if exists tenant_whatsapp_set_updated_at on public.tenant_whatsapp;
create trigger tenant_whatsapp_set_updated_at
  before update on public.tenant_whatsapp
  for each row execute function private.set_updated_at();

-- 3) Sır tablosu (access_token) — authenticated'a yetki YOK.
create table if not exists public.tenant_whatsapp_secret (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  access_token text not null,
  updated_at   timestamptz not null default now()
);

-- 4) RLS.
alter table public.tenant_whatsapp enable row level security;
alter table public.tenant_whatsapp force row level security;
grant select on public.tenant_whatsapp to authenticated;

drop policy if exists tenant_whatsapp_read on public.tenant_whatsapp;
create policy tenant_whatsapp_read on public.tenant_whatsapp
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

alter table public.tenant_whatsapp_secret enable row level security;
alter table public.tenant_whatsapp_secret force row level security;
-- grant YOK, policy YOK — kasıtlı (yalnız definer fn + service_role).

-- 5) Plan geçidi.
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
grant execute on function private.whatsapp_plan_allows(uuid) to authenticated;

-- 6) Bağlama (settings.manage + plan kapılı; token ayrı tabloya).
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
        verified_at     = null;

  insert into public.tenant_whatsapp_secret (tenant_id, access_token)
  values (_tenant, _access_token)
  on conflict (tenant_id) do update set access_token = excluded.access_token, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.set_whatsapp_integration(uuid, text, text, text) from public, anon;
grant execute on function public.set_whatsapp_integration(uuid, text, text, text) to authenticated;

-- 7) Bağlantıyı kesme.
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
