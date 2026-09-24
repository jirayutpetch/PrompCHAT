-- Only server-side service-role requests may access bot credentials or delivery links.
create table if not exists public.telegram_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  bot_id bigint not null unique,
  bot_username text not null,
  token_encrypted text not null,
  webhook_secret_hash text not null,
  chat_id bigint,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  delivery_mode text not null default 'telegram' check (delivery_mode in ('app', 'telegram')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.telegram_connections enable row level security;
revoke all on public.telegram_connections from anon, authenticated;

create table if not exists public.telegram_message_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid unique references public.messages(id) on delete set null,
  chat_id bigint not null,
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  unique(workspace_id, chat_id, telegram_message_id)
);
create index if not exists telegram_message_links_conversation_idx
  on public.telegram_message_links(workspace_id, conversation_id);
alter table public.telegram_message_links enable row level security;
revoke all on public.telegram_message_links from anon, authenticated;

create table if not exists public.telegram_processed_updates (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  update_id bigint not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, update_id)
);
alter table public.telegram_processed_updates enable row level security;
revoke all on public.telegram_processed_updates from anon, authenticated;
