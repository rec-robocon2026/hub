import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { commitTouches, type PushCommit } from "@/lib/github";
import { SUPABASE_URL } from "@/lib/supabase/env";

// GitHub → hub. Registers every push to modules/<slug>/… as history on that module.
// Needs GITHUB_WEBHOOK_SECRET (same value as in the GitHub webhook) and SUPABASE_SECRET_KEY.

type PushPayload = {
  ref?: string;
  repository?: { full_name?: string };
  commits?: PushCommit[];
  pusher?: { name?: string };
};

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) return NextResponse.json({ error: "webhook not configured" }, { status: 501 });

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "push") return NextResponse.json({ ok: true, ignored: event });

  const payload = JSON.parse(body) as PushPayload;
  const repo = payload.repository?.full_name;
  const branch = payload.ref?.replace(/^refs\/heads\//, "") ?? null;
  if (!repo || !payload.commits?.length) return NextResponse.json({ ok: true, commits: 0 });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });

  const { data: season } = await supabase.from("seasons").select("id, robots(id)").ilike("repo", repo).maybeSingle();
  const robot = Array.isArray(season?.robots) ? season?.robots[0] : season?.robots;
  if (!season || !robot) return NextResponse.json({ ok: true, ignored: `no season uses ${repo}` });

  const { data: mods } = await supabase.from("modules").select("id, slug, subsystems!inner(robot_id)").eq("subsystems.robot_id", robot.id);
  const moduleBySlug = new Map((mods ?? []).map((m) => [m.slug, m.id]));

  const rows = payload.commits.flatMap((c) =>
    commitTouches(c)
      .filter((t) => moduleBySlug.has(t.slug))
      .map((t) => ({
        module_id: moduleBySlug.get(t.slug),
        actor_name: c.author?.username ?? c.author?.name ?? payload.pusher?.name ?? "github",
        action: c.message.split("\n")[0].slice(0, 200),
        detail: `${t.files} file${t.files === 1 ? "" : "s"}`,
        lane: t.lane,
        sha: c.id,
        branch,
        source: "github" as const,
      })),
  );

  if (rows.length) {
    const { error } = await supabase.from("events").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, registered: rows.length });
}
