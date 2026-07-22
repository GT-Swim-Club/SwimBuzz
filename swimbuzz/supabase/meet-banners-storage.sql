insert into storage.buckets (id, name, public) values ('meet-banners', 'meet-banners', true);
create policy "Public Access" on storage.objects for select using ( bucket_id = 'meet-banners' );
create policy "Authenticated Upload" on storage.objects for insert with check ( bucket_id = 'meet-banners' AND auth.role() = 'authenticated' );
create policy "Authenticated Delete" on storage.objects for delete using ( bucket_id = 'meet-banners' AND auth.role() = 'authenticated' );
