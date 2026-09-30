import type { Metadata } from "next";
import Link from "next/link";
import { AssetFlags, Empty, StatusTag, Tag } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import type { AssetHealth, Module } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim();
  const { supabase } = await requireMember();

  let assets: AssetHealth[] = [];
  let modules: (Module & { subsystems: { code: string; robots: { code: string; seasons: { prefix: string } } } })[] = [];
  if (query) {
    // Strip characters PostgREST's or() filter treats as syntax.
    const term = `%${query.replace(/[%,()*]/g, " ")}%`;
    const [a, m] = await Promise.all([
      supabase.from("asset_health").select("*").or(`name.ilike.${term},title.ilike.${term},kind.ilike.${term},notes.ilike.${term}`).order("season_year", { ascending: false }).limit(60),
      supabase.from("modules").select("*, subsystems(code, robots(code, seasons(prefix)))").or(`name.ilike.${term},slug.ilike.${term},description.ilike.${term}`).limit(30),
    ]);
    assets = (a.data as AssetHealth[] | null) ?? [];
    modules = (m.data as typeof modules | null) ?? [];
  }

  return (
    <main className="page">
      <div className="kicker">Search every season</div>
      <form action="/search" className="row" style={{ marginBottom: 28, maxWidth: 560 }}>
        <input className="input" name="q" defaultValue={query} placeholder="RC26-R1-DRV, encoder, gripper…" autoFocus style={{ flex: 1 }} />
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {!query ? (
        <p className="text-muted">Search names, titles, kinds and notes across every season.</p>
      ) : assets.length + modules.length === 0 ? (
        <Empty title={`Nothing matches “${query}”`} body="Try part of a name (WHEELMOD), a robot and code (R1-DRV) or a kind (Schematic)." />
      ) : (
        <>
          {modules.length > 0 && (
            <>
              <h3 style={{ margin: "0 0 12px" }}>Modules</h3>
              <div className="row" style={{ marginBottom: 32 }}>
                {modules.map((m) => (
                  <Link key={m.id} href={`/modules/${m.id}`} className="btn btn-secondary">
                    {m.subsystems?.robots?.seasons?.prefix}-{m.subsystems?.robots?.code} · {m.name}
                  </Link>
                ))}
              </div>
            </>
          )}
          {assets.length > 0 && (
            <>
              <h3 style={{ margin: "0 0 12px" }}>Items</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Season</th>
                      <th>Module</th>
                      <th>Kind</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/assets/${a.id}`} className="mono">{a.name}</Link>
                          <div className="text-muted small">{a.title}</div>
                          <div className="flags"><AssetFlags asset={a} /></div>
                        </td>
                        <td><Tag kind="neutral">{a.season_prefix}-{a.robot_code}</Tag></td>
                        <td className="small"><Link href={`/modules/${a.module_id}`}>{a.module_name}</Link></td>
                        <td className="text-muted small">{a.kind}</td>
                        <td><StatusTag status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
