-- Keep the free 1 GB of storage for what the app uploads: photos and PDFs,
-- at most 5 MB each (the app checks the same limit before uploading).
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
 where id = 'files';
