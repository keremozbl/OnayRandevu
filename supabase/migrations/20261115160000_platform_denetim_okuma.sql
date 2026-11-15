-- Platform denetim kaydı okuma yüzeyi.
--
-- platform_audit tablosuna plan/durum/deneme/kurum-oluşturma eylemleri zaten
-- yazılıyordu (85_platform); eksik olan ekranın okuduğu fonksiyon. Diğer
-- platform_* okuma fonksiyonlarıyla aynı sözleşme: is_platform_admin() kapılı,
-- security definer, yalnız gereken özeti döndürür. Aktör e-postası ve kurum
-- adı/slug'ı join'le eklenir (hasta/müşteri PII değil).
create or replace function public.platform_audit_log(
  _tenant_id uuid default null,
  _limit     int  default 200
)
returns table (
  id          uuid,
  actor_id    uuid,
  actor_email text,
  action      text,
  tenant_id   uuid,
  tenant_name text,
  tenant_slug text,
  detail      jsonb,
  at          timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    pa.id,
    pa.actor_id,
    au.email::text,
    pa.action,
    pa.tenant_id,
    t.name,
    t.slug,
    pa.detail,
    pa.at
  from public.platform_audit pa
  left join auth.users au on au.id = pa.actor_id
  left join public.tenants t on t.id = pa.tenant_id
  where _tenant_id is null or pa.tenant_id = _tenant_id
  order by pa.at desc
  limit greatest(1, least(coalesce(_limit, 200), 500));
end;
$$;

revoke execute on function public.platform_audit_log(uuid, int) from public, anon;
grant execute on function public.platform_audit_log(uuid, int) to authenticated;
