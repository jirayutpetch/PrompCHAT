alter table public.workspace_settings
  add column if not exists agent_icon text not null default 'PA',
  add column if not exists visitor_icon text not null default '👤';
