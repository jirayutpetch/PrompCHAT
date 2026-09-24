-- Enforce the five-workspace plan and unique host names even if clients bypass the UI.
create or replace function public.enforce_workspace_owner_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_domain text;
begin
  normalized_domain := regexp_replace(lower(trim(new.domain)), '^https?://', '');
  normalized_domain := regexp_replace(normalized_domain, '/+$', '');
  normalized_domain := regexp_replace(normalized_domain, '\.+$', '');

  if normalized_domain = '' then
    raise exception using errcode = '22023', message = 'workspace_domain_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 9341));

  if exists (
    select 1 from public.workspaces w
    where w.owner_id = new.owner_id
      and regexp_replace(regexp_replace(regexp_replace(lower(trim(w.domain)), '^https?://', ''), '/+$', ''), '\.+$', '') = normalized_domain
  ) then
    raise exception using errcode = '23505', message = 'workspace_domain_already_exists';
  end if;

  if (select count(*) from public.workspaces w where w.owner_id = new.owner_id) >= 5 then
    raise exception using errcode = '23514', message = 'workspace_limit_reached';
  end if;

  new.domain := normalized_domain;
  return new;
end;
$$;

drop trigger if exists workspaces_owner_limits_before_insert on public.workspaces;
create trigger workspaces_owner_limits_before_insert
before insert on public.workspaces
for each row execute function public.enforce_workspace_owner_limits();

-- Keep object storage in sync when an owner deletes a workspace.
drop policy if exists "workspace members delete chat files" on storage.objects;
create policy "workspace members delete chat files" on storage.objects for delete to authenticated
using (bucket_id = 'chat-attachments' and public.is_workspace_member((storage.foldername(name))[1]::uuid));

-- Match a visitor message to the owner's active keyword rules and save the bot reply.
create or replace function public.apply_visitor_automation(target_conversation uuid, target_message uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_workspace uuid;
  message_text text;
  visitor_auth_id uuid;
  bot_is_enabled boolean;
  handoff_keyword text;
  reply text;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception using errcode = '42501', message = 'anonymous_visitor_required';
  end if;

  select c.workspace_id, m.body, v.auth_user_id
    into current_workspace, message_text, visitor_auth_id
  from public.conversations c
  join public.messages m on m.id = target_message and m.conversation_id = c.id and m.workspace_id = c.workspace_id
  join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id
  where c.id = target_conversation;

  if current_workspace is null or visitor_auth_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'visitor_message_not_owned';
  end if;

  select coalesce(s.bot_enabled, true), coalesce(s.bot_handoff_keyword, '')
    into bot_is_enabled, handoff_keyword
  from public.workspace_settings s where s.workspace_id = current_workspace;
  if not found then bot_is_enabled := true; handoff_keyword := 'คุยกับแอดมิน'; end if;
  if not bot_is_enabled then return null; end if;

  if handoff_keyword <> '' and position(lower(handoff_keyword) in lower(coalesce(message_text, ''))) > 0 then
    update public.conversations set handled_by = 'agent', status = 'pending', updated_at = now(), last_message_at = now()
    where id = target_conversation and workspace_id = current_workspace;
    return null;
  end if;

  select t.reply_text into reply
  from public.bot_triggers t
  where t.workspace_id = current_workspace and t.is_active and length(trim(t.reply_text)) > 0
    and exists (
      select 1 from unnest(t.keywords) keyword
      where length(trim(keyword)) > 0 and case when t.match_type = 'exact'
        then lower(trim(message_text)) = lower(trim(keyword))
        else position(lower(trim(keyword)) in lower(coalesce(message_text, ''))) > 0 end
    )
  order by t.sort_order asc
  limit 1;

  if reply is null then return null; end if;
  insert into public.messages(workspace_id, conversation_id, sender_type, body)
  values (current_workspace, target_conversation, 'bot', reply);
  update public.conversations set handled_by = 'bot', status = 'pending', updated_at = now(), last_message_at = now()
  where id = target_conversation and workspace_id = current_workspace;
  return reply;
end;
$$;

revoke all on function public.apply_visitor_automation(uuid, uuid) from public;
grant execute on function public.apply_visitor_automation(uuid, uuid) to authenticated;
