create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, domain text not null, domain_verified boolean not null default false,
  embed_key text unique not null default encode(gen_random_bytes(16), 'hex'), created_at timestamptz not null default now()
);
create table if not exists public.agents (
  id uuid not null references auth.users(id) on delete cascade, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text, avatar_url text, role text not null default 'owner', created_at timestamptz not null default now(), primary key(id, workspace_id)
);
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id text not null, auth_user_id uuid not null references auth.users(id) on delete cascade, name text, email text, created_at timestamptz not null default now(), unique(workspace_id, session_id), unique(workspace_id, auth_user_id), unique(id, workspace_id)
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visitor_id uuid references public.visitors(id) on delete set null, assigned_agent_id uuid, status text not null default 'open' check (status in ('open','pending','closed')),
  handled_by text not null default 'bot' check (handled_by in ('bot','agent')), site_url text, last_message_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, workspace_id), foreign key (assigned_agent_id, workspace_id) references public.agents(id, workspace_id) on delete set null (assigned_agent_id),
  foreign key (visitor_id, workspace_id) references public.visitors(id, workspace_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade, sender_type text not null check (sender_type in ('visitor','agent','bot')),
  sender_id uuid, body text, attachment_url text, attachment_name text, attachment_type text, attachment_size bigint, created_at timestamptz not null default now(),
  foreign key (conversation_id, workspace_id) references public.conversations(id, workspace_id) on delete cascade
);
create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade, brand_name text not null default 'PromptCHAT', logo_url text,
  bubble_icon text not null default 'message-circle', color_primary text not null default '#35C2F0', color_bg text not null default '#0B0B0D', color_accent text not null default '#35C2F0',
  widget_position text not null default 'bottom-right', welcome_message text not null default 'สวัสดีค่ะ มีอะไรให้เราช่วยไหมคะ?', offline_message text not null default 'ตอนนี้ทีมงานไม่อยู่ ฝากข้อความไว้ได้เลยค่ะ',
  bot_enabled boolean not null default true, bot_handoff_keyword text not null default 'คุยกับแอดมิน', ai_fallback_enabled boolean not null default false, ai_max_calls_per_conversation int not null default 5, updated_at timestamptz not null default now()
);
create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, day_of_week int not null check (day_of_week between 0 and 6),
  open_time time, close_time time, is_closed boolean not null default false, unique(workspace_id, day_of_week)
);
create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, label text not null, icon text, reply_text text, sort_order int not null default 0, is_active boolean not null default true
);
create table if not exists public.bot_triggers (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, keywords text[] not null, reply_text text not null,
  match_type text not null default 'contains' check (match_type in ('contains','exact')), is_active boolean not null default true, sort_order int not null default 0
);
create table if not exists public.canned_responses (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, shortcut text not null, body text not null,
  agent_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(workspace_id, shortcut)
);
create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, title text not null, content text not null,
  source_url text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists conversations_workspace_status_idx on public.conversations(workspace_id, status, updated_at desc);
create index if not exists visitors_workspace_session_idx on public.visitors(workspace_id, session_id);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents where id = auth.uid() and workspace_id = target_workspace);
$$;

alter table public.workspaces enable row level security;
alter table public.agents enable row level security;
alter table public.visitors enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.business_hours enable row level security;
alter table public.quick_replies enable row level security;
alter table public.bot_triggers enable row level security;
alter table public.canned_responses enable row level security;
alter table public.knowledge_base enable row level security;

create policy "workspace owners manage workspaces" on public.workspaces for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "agents read own workspace" on public.agents for select using (id = auth.uid() or public.is_workspace_member(workspace_id));
create policy "members read conversations" on public.conversations for select using (public.is_workspace_member(workspace_id));
create policy "members manage conversations" on public.conversations for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read messages" on public.messages for select using (public.is_workspace_member(workspace_id));
create policy "members write messages" on public.messages for insert with check (public.is_workspace_member(workspace_id));
create policy "members manage settings" on public.workspace_settings for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage bot config" on public.business_hours for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage quick replies" on public.quick_replies for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage bot triggers" on public.bot_triggers for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage canned responses" on public.canned_responses for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage knowledge base" on public.knowledge_base for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "visitors read own profile" on public.visitors for select using (auth_user_id = auth.uid() and auth.jwt() ->> 'is_anonymous' = 'true');
create policy "members read visitors" on public.visitors for select using (public.is_workspace_member(workspace_id));
create policy "visitors read own conversations" on public.conversations for select using (
  exists (select 1 from public.visitors v where v.id = visitor_id and v.workspace_id = conversations.workspace_id and v.auth_user_id = auth.uid())
);
create policy "visitors create own conversations" on public.conversations for insert with check (
  exists (select 1 from public.visitors v where v.id = visitor_id and v.workspace_id = conversations.workspace_id and v.auth_user_id = auth.uid())
);
create policy "visitors read own messages" on public.messages for select using (
  exists (select 1 from public.conversations c join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id where c.id = messages.conversation_id and c.workspace_id = messages.workspace_id and v.auth_user_id = auth.uid())
);
create policy "visitors send own messages" on public.messages for insert with check (
  sender_type = 'visitor' and sender_id = auth.uid() and exists (select 1 from public.conversations c join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id where c.id = messages.conversation_id and c.workspace_id = messages.workspace_id and v.auth_user_id = auth.uid())
);
create policy "widget reads settings" on public.workspace_settings for select using (true);
create policy "widget reads quick replies" on public.quick_replies for select using (is_active);
create policy "widget reads bot triggers" on public.bot_triggers for select using (is_active);
create policy "widget reads business hours" on public.business_hours for select using (true);

create or replace function public.provision_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.agents (id, workspace_id, display_name, role) values (new.owner_id, new.id, coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = new.owner_id), 'Owner'), 'owner');
  insert into public.workspace_settings (workspace_id, brand_name) values (new.id, new.name);
  return new;
end;
$$;
create trigger workspaces_provision_after_insert after insert on public.workspaces for each row execute function public.provision_workspace();

create or replace function public.initialize_widget_visitor(widget_key text)
returns table (workspace_id uuid, visitor_id uuid) language plpgsql security definer set search_path = public as $$
declare target_workspace uuid;
declare target_visitor uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception 'anonymous_auth_required';
  end if;
  select w.id into target_workspace from public.workspaces w where w.embed_key = widget_key and w.domain_verified = true;
  if target_workspace is null then raise exception 'invalid_widget_key'; end if;
  insert into public.visitors (workspace_id, auth_user_id, session_id)
  values (target_workspace, auth.uid(), encode(gen_random_bytes(16), 'hex'))
  on conflict (workspace_id, auth_user_id) do update set auth_user_id = excluded.auth_user_id
  returning id into target_visitor;
  return query select target_workspace, target_visitor;
end;
$$;
revoke all on function public.initialize_widget_visitor(text) from public;
grant execute on function public.initialize_widget_visitor(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit) values ('chat-attachments', 'chat-attachments', false, 52428800)
on conflict (id) do nothing;
create policy "workspace members upload chat files" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-attachments' and public.is_workspace_member((storage.foldername(name))[1]::uuid));
create policy "visitors upload own chat files" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-attachments' and exists (
  select 1 from public.conversations c join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id
  where c.workspace_id::text = (storage.foldername(name))[1] and c.id::text = (storage.foldername(name))[2] and v.auth_user_id = auth.uid()
));
create policy "workspace members read chat files" on storage.objects for select to authenticated
using (bucket_id = 'chat-attachments' and public.is_workspace_member((storage.foldername(name))[1]::uuid));
create policy "visitors read own chat files" on storage.objects for select to authenticated
using (bucket_id = 'chat-attachments' and exists (
  select 1 from public.conversations c join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id
  where c.workspace_id::text = (storage.foldername(name))[1] and c.id::text = (storage.foldername(name))[2] and v.auth_user_id = auth.uid()
));

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.workspace_settings;
