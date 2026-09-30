import { recordFile } from "@/app/(hub)/actions";
import { createClient } from "@/lib/supabase/client";
import type { ActionResult } from "@/lib/types";

export const MAX_BYTES = 50 * 1024 * 1024;

/** Browser → exports bucket directly (no size limit from the Next server), then record the row. */
export async function uploadToAsset(assetId: string, file: File): Promise<ActionResult> {
  if (file.size > MAX_BYTES) return { ok: false, message: `${file.name} is over 50 MB` };
  const supabase = createClient();
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${assetId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage
    .from("exports")
    .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (error) return { ok: false, message: `${file.name}: ${error.message}` };
  return recordFile({ assetId, path, fileName: file.name, size: file.size });
}
