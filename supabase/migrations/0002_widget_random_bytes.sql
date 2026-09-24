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
  values (target_workspace, auth.uid(), encode(extensions.gen_random_bytes(16), 'hex'))
  on conflict on constraint visitors_workspace_id_auth_user_id_key do update set auth_user_id = excluded.auth_user_id
  returning id into target_visitor;
  return query select target_workspace, target_visitor;
end;
$$;
