-- Validate the actual PostgREST browser request as well as the claimed host page
-- origin. Widget traffic normally comes from the PrompCHAT iframe origin; direct
-- browser integrations may come from the verified workspace domain itself.
create or replace function public.initialize_widget_visitor(widget_key text, site_origin text)
returns table (workspace_id uuid, visitor_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_workspace uuid;
  target_domain text;
  target_visitor uuid;
  normalized_origin text := lower(trim(site_origin));
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  request_origin text := lower(trim(coalesce(request_headers ->> 'origin', '')));
  request_referer text := lower(coalesce(request_headers ->> 'referer', ''));
  request_referer_origin text := substring(lower(coalesce(request_headers ->> 'referer', '')) from '^(https://[^/]+)');
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception using errcode = '42501', message = 'anonymous_auth_required';
  end if;
  if normalized_origin !~ '^https://[a-z0-9.-]+$' then
    raise exception using errcode = '22023', message = 'invalid_site_origin';
  end if;

  select w.id, lower(regexp_replace(regexp_replace(trim(w.domain), '^https?://', '', 'i'), '/+$', ''))
    into target_workspace, target_domain
  from public.workspaces w
  where w.embed_key = widget_key and w.domain_verified = true;
  if target_workspace is null then raise exception using errcode = '42501', message = 'invalid_widget_key'; end if;
  target_domain := regexp_replace(target_domain, '\.+$', '');

  -- Reject browser requests from unrelated sites even if they forge site_origin.
  -- The iframe is served from the canonical product origin, so its own Origin and
  -- Referer must match that host while site_origin independently binds the merchant.
  if request_origin not in ('https://prompchat.vercel.app', 'https://promp-chat.vercel.app', 'https://' || target_domain)
     or (request_referer_origin is not null and request_referer_origin <> request_origin) then
    insert into public.widget_abuse_audit(workspace_id, visitor_auth_id, event_type, detail)
    values (target_workspace, auth.uid(), 'request_origin_mismatch', jsonb_build_object(
      'origin', left(request_origin, 255), 'referer_origin', left(coalesce(request_referer_origin, ''), 255)
    ));
    return;
  end if;
  if split_part(regexp_replace(normalized_origin, '^https://', ''), '/', 1) <> target_domain then
    insert into public.widget_abuse_audit(workspace_id, visitor_auth_id, event_type, detail)
    values (target_workspace, auth.uid(), 'origin_mismatch', jsonb_build_object('origin', left(normalized_origin, 255)));
    return;
  end if;

  insert into public.visitors (workspace_id, auth_user_id, session_id, site_origin)
  values (target_workspace, auth.uid(), encode(extensions.gen_random_bytes(16), 'hex'), normalized_origin)
  on conflict on constraint visitors_workspace_id_auth_user_id_key do update
    set site_origin = coalesce(public.visitors.site_origin, excluded.site_origin)
  returning id, public.visitors.site_origin into target_visitor, normalized_origin;
  if normalized_origin <> lower(trim(site_origin)) then
    insert into public.widget_abuse_audit(workspace_id, visitor_auth_id, event_type, detail)
    values (target_workspace, auth.uid(), 'visitor_origin_rebind', jsonb_build_object('origin', left(site_origin, 255)));
    return;
  end if;
  return query select target_workspace, target_visitor;
end;
$$;

revoke all on function public.initialize_widget_visitor(text, text) from public;
grant execute on function public.initialize_widget_visitor(text, text) to authenticated;
