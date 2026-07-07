-- Run this in the Supabase SQL editor after creating a public bucket named "meet-files".
-- Dashboard: Storage → New bucket → Name: meet-files → Public bucket: ON

-- Public read access (so athletes can open uploaded PDFs via the public URL).
CREATE POLICY "meet_files_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'meet-files');

-- Allow uploads/updates/deletes to the meet-files bucket.
-- (Service role bypasses RLS; these policies also cover the anon key if misconfigured.)
CREATE POLICY "meet_files_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meet-files');

CREATE POLICY "meet_files_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meet-files');

CREATE POLICY "meet_files_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'meet-files');
