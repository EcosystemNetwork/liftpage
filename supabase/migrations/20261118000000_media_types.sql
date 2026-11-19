-- Post media is public, so the bucket itself refuses anything but the image and video
-- types the desk offers. A signed upload URL otherwise takes any file.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm'
]
where id = 'post-media';
