-- Run this in the Supabase SQL editor after creating a public bucket named "avatars".
-- Dashboard: Storage → New bucket → Name: avatars → Public bucket: ON
-- Optional: set file size limit to 256 KB and allowed MIME types to image/jpeg, image/png, image/webp.

-- Public read access (profile pictures are shown in the nav and settings).
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow uploads/updates/deletes to the avatars bucket.
-- (Service role bypasses RLS; these policies also cover the anon key if misconfigured.)
CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars');
