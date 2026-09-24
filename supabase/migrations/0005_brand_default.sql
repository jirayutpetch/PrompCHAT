alter table public.workspace_settings
  alter column brand_name set default 'PrompCHAT';

update public.workspace_settings
set brand_name = 'PrompCHAT'
where brand_name = 'PromptCHAT';
