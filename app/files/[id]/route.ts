import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Private bucket: hand out a short-lived signed URL, but only if RLS lets this user see the file row.
export async function GET(_request: NextRequest, { params }: RouteContext<"/files/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: file } = await supabase.from("asset_files").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage
    .from("exports")
    .createSignedUrl(file.storage_path, 60, { download: file.file_name });
  if (error || !data) return new NextResponse(error?.message ?? "Could not sign URL", { status: 500 });

  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
