-- GreenProof - storage bucket + policies

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tree-photos', 'tree-photos', false)
on conflict (id) do nothing;

create policy "upload tree photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'tree-photos');

create policy "read tree photos" on storage.objects for select to authenticated
  using (bucket_id = 'tree-photos');
