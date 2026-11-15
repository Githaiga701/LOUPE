import { issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * Short-lived, single-file read URL for a private upload.
 *
 * The checks service never holds the store's read-write token: for each job
 * the web app signs a GET URL scoped to exactly one pathname, valid for a few
 * minutes, and passes only that URL across. Least privilege, and a leaked URL
 * expires on its own.
 */
export async function signedReadUrl(pathname: string, ttlMs = 20 * 60 * 1000): Promise<string> {
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
  return presignedUrl;
}
