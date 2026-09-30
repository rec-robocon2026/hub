import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { commitTouches, type PushCommit } from "@/lib/github";
import { SUPABASE_URL } from "@/lib/supabase/env";

// GitHub → hub. Registers every push to <robot>/<module>/… (e.g. R1/claw/) as history on that module.
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
  if (event === "pull_request") return pullRequestEvent(JSON.parse(body), serviceKey);
  if (event !== "push") return NextResponse.json({ ok: true, ignored: event });

  const payload = JSON.parse(body) as PushPayload;
  const repo = payload.repository?.full_name;
  const branch = payload.ref?.replace(/^refs\/heads\//, "") ?? null;
  if (!repo || !payload.commits?.length) return NextResponse.json({ ok: true, commits: 0 });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });

  const { data: season } = await supabase.from("seasons").select("id, robots(id, code)").ilike("repo", repo).maybeSingle();
  const robots = (season?.robots ?? []) as { id: string; code: string }[];
  if (!season || !robots.length) return NextResponse.json({ ok: true, ignored: `no season uses ${repo}` });

  const codeOf = new Map(robots.map((r) => [r.id, r.code]));
  const { data: mods } = await supabase
    .from("modules")
    .select("id, slug, subsystems!inner(robot_id)")
    .in("subsystems.robot_id", robots.map((r) => r.id));
  const list = (mods ?? []).map((m) => {
    const sub = (Array.isArray(m.subsystems) ? m.subsystems[0] : m.subsystems) as { robot_id: string };
    return { id: m.id as string, slug: m.slug as string, robot: codeOf.get(sub.robot_id) ?? "" };
  });
  const findModule = (robot: string, slug: string) => list.find((m) => m.slug === slug && m.robot === robot)?.id;

  const rows = payload.commits.flatMap((c) =>
    commitTouches(c)
      .map((t) => ({ ...t, moduleId: findModule(t.robot, t.slug) }))
      .filter((t) => t.moduleId)
      .map((t) => ({
        module_id: t.moduleId,
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

type PullPayload = {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: { number: number; merged?: boolean };
};

/** Keeps the hub's review panel in step when a lead merges or closes on GitHub itself. */
async function pullRequestEvent(payload: PullPayload, serviceKey: string) {
  const repo = payload.repository?.full_name;
  const number = payload.pull_request?.number;
  if (!repo || !number) return NextResponse.json({ ok: true });
  const status =
    payload.action === "closed" ? (payload.pull_request?.merged ? "merged" : "closed") : payload.action === "reopened" ? "open" : null;
  if (!status) return NextResponse.json({ ok: true, ignored: payload.action });

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("proposals")
    .update({ status, updated_at: new Date().toISOString() })
    .ilike("repo", repo)
    .eq("pr_number", number)
    .neq("status", status)
    .select("id");
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
