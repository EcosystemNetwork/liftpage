/** Strips a pasted profile link down to the handle or page name, and drops a leading @. */
export function cleanHandle(raw: string): string {
  const value = raw.trim().slice(0, 200);
  const fromUrl = value.match(/^(?:https?:\/\/)?(?:www\.|m\.)?[a-z0-9.-]+\.[a-z]{2,}\/(?:@)?([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : value).replace(/^@+/, "").trim();
}
