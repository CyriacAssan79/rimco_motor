type SignedUrlResult = { data: { signedUrl: string } | null; error: unknown | null };
type SignedUrlCreator = (path: string, expiresIn: number, options?: { download?: string | boolean }) => Promise<SignedUrlResult>;

/** Creates a signed Storage URL with Content-Disposition set to attachment. */
export async function createSignedVideoDownloadUrl(createSignedUrl: SignedUrlCreator, path: string) {
  const { data, error } = await createSignedUrl(path, 3600, { download: true });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
