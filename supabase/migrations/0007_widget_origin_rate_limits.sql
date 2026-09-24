-- Bind every anonymous widget visitor to the embedding site and enforce abuse
-- controls inside Postgres so direct PostgREST calls cannot bypass the UI.
alter table public.visitors add column if not exists site_origin text;

create table if not exists public.widget_rate_windows (
  bucket_key text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0
);
alter table public.widget_rate_windows enable row level security;

create table if not exists public.widget_abuse_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visitor_auth_id uuid,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.widget_abuse_audit enable row level security;
drop policy if exists "workspace members read widget abuse audit" on public.widget_abuse_audit;
create policy "workspace members read widget abuse audit"
  on public.widget_abuse_audit for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop function if exists public.initialize_widget_visitor(text);
create function public.initialize_widget_visitor(widget_key text, site_origin text)
returns table (workspace_id uuid, visitor_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_workspace uuid;
  target_domain text;
  target_visitor uuid;
  normalized_origin text := lower(trim(site_origin));
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

create or replace function public.enforce_visitor_message_limits()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  visitor_origin text;
  workspace_domain text;
  bucket_count integer;
  bucket_now timestamptz := date_trunc('minute', now());
  message_bytes integer := octet_length(coalesce(new.body, ''));
begin
  if new.sender_type <> 'visitor' then return new; end if;
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception using errcode = '42501', message = 'anonymous_visitor_required';
  end if;

  select v.site_origin, regexp_replace(lower(regexp_replace(regexp_replace(trim(w.domain), '^https?://', '', 'i'), '/+$', '')), '\.+$', '')
    into visitor_origin, workspace_domain
  from public.conversations c
  join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id
  join public.workspaces w on w.id = c.workspace_id
  where c.id = new.conversation_id and c.workspace_id = new.workspace_id and v.auth_user_id = auth.uid();
  if visitor_origin is null or split_part(regexp_replace(visitor_origin, '^https://', ''), '/', 1) <> workspace_domain then
    raise exception using errcode = '42501', message = 'widget_domain_mismatch';
  end if;

  if message_bytes > 4000 then
    insert into public.widget_abuse_audit(workspace_id, visitor_auth_id, event_type, detail)
    values (new.workspace_id, auth.uid(), 'message_too_large', jsonb_build_object('bytes', message_bytes));
    return null;
  end if;
  if new.attachment_url is not null and (
    new.attachment_size is null or new.attachment_size > 15728640 or
    new.attachment_type not in ('image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ) then
    insert into public.widget_abuse_audit(workspace_id, visitor_auth_id, event_type, detail)
    values (new.workspace_id, auth.uid(), 'attachment_rejected', jsonb_build_object('mime', left(coalesce(new.attachment_type, ''), 120), 'bytes', new.attachment_size));
    return null;
  end if;

  insert into public.widget_rate_windows(bucket_key, workspace_id, window_started_at, request_count)
  values ('visitor:' || new.workspace_id::text || ':' || auth.uid()::text, new.workspace_id, bucket_now, 1)
  on conflict (bucket_key) do update set
    request_count = case when public.widget_rate_windows.window_started_at < bucket_now then 1 else public.widget_rate_windows.request_count + 1 end,
    window_started_at = case when public.widget_rate_windows.window_started_at < bucket_now then bucket_now else public.widget_rate_windows.window_started_at end
  returning request_count into bucket_count;

  if bucket_count > 12 then
    insert into public.widget_abuse_audit(workspace_id, visitor_auth_id, event_type, detail)
    values (new.workspace_id, auth.uid(), 'visitor_rate_limited', jsonb_build_object('limit_per_minute', 12));
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists visitor_message_rate_limit on public.messages;
create trigger visitor_message_rate_limit before insert on public.messages
for each row execute function public.enforce_visitor_message_limits();

update storage.buckets set file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'chat-attachments';
