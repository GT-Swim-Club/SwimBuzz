-- Run this in the Supabase SQL editor after creating a public bucket named "meet-icons".
-- Dashboard: Storage → New bucket → Name: meet-icons → Public bucket: ON

-- Public read access (so everyone can see meet icons).
CREATE POLICY "meet_icons_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'meet-icons');

-- Allow uploads/updates/deletes to the meet-icons bucket.
CREATE POLICY "meet_icons_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meet-icons');

CREATE POLICY "meet_icons_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meet-icons');

CREATE POLICY "meet_icons_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'meet-icons');
