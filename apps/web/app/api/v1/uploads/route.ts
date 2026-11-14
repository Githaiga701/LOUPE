import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { env } from "@/lib/env";
import { SUPPORTED_IMAGE_TYPES, UPLOAD_MAX_MB } from "@/lib/checks";

/**
 * Client uploads go browser → Vercel Blob directly (no bytes through this
 * function). This route only hands out a short-lived token and records the
 * upload when Blob confirms it landed.
 *
 * Spec §13: size cap and type allow-list are enforced here *before* the token
 * is issued; magic-byte sniffing happens in the checks service's ingest step.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const uploadId = newId("upl");
        return {
          allowedContentTypes: SUPPORTED_IMAGE_TYPES,
          maximumSizeInBytes: UPLOAD_MAX_MB * 1024 * 1024,
          addRandomSuffix: true,
          // Keep private: originals are never public. Reports hide them by default.
          access: "private",
          tokenPayload: JSON.stringify({ uploadId, clientPayload, pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { uploadId } = JSON.parse(tokenPayload ?? "{}") as { uploadId: string };
        const expiresAt = new Date(Date.now() + env.RETENTION_HOURS_ANON * 3600 * 1000);
        await db().insert(schema.uploads).values({
          id: uploadId,
          mediaType: "image",
          contentType: blob.contentType,
          blobUrl: blob.url,
          blobPathname: blob.pathname,
          expiresAt,
        });
      },
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
