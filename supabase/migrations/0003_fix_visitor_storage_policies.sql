drop policy if exists "visitors upload own chat files" on storage.objects;
create policy "visitors upload own chat files" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-attachments' and exists (
  select 1 from public.conversations c join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id
  where c.workspace_id::text = (storage.foldername(storage.objects.name))[1]
    and c.id::text = (storage.foldername(storage.objects.name))[2]
    and v.auth_user_id = auth.uid()
));

drop policy if exists "visitors read own chat files" on storage.objects;
create policy "visitors read own chat files" on storage.objects for select to authenticated
using (bucket_id = 'chat-attachments' and exists (
  select 1 from public.conversations c join public.visitors v on v.id = c.visitor_id and v.workspace_id = c.workspace_id
  where c.workspace_id::text = (storage.foldername(storage.objects.name))[1]
    and c.id::text = (storage.foldername(storage.objects.name))[2]
    and v.auth_user_id = auth.uid()
));
