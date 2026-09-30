import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/format";
import type { LaneState } from "@/lib/health";
import type { AssetHealth, Status } from "@/lib/types";

/** The four "+" registration marks every blueprint object wears. */
export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

export function Box({
  children,
  className = "",
  style,
  tint,
  dark,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  tint?: boolean;
  dark?: boolean;
}) {
  return (
    <div className={`blueprint ${tint ? "tint" : ""} ${dark ? "dark" : ""} ${className}`} style={style}>
      <Corners />
      {children}
    </div>
  );
}

export function LinkCard({ href, children, className = "", style }: { href: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <Link href={href} className={`card blueprint link-card ${className}`} style={style}>
      <Corners />
      {children}
    </Link>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn btn-primary blueprint">
      <Corners />
      {children}
    </Link>
  );
}

export function Tag({ kind = "outline", children, title }: { kind?: "accent" | "outline" | "neutral" | "warn"; children: ReactNode; title?: string }) {
  return (
    <span className={`tag tag-${kind}`} title={title}>
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status: Status }) {
  const kind = status === "as_built" ? "accent" : status === "retired" ? "neutral" : "outline";
  return <Tag kind={kind}>{STATUS_LABEL[status].toUpperCase()}</Tag>;
}

/** Messy name / missing exports flags for one asset. */
export function AssetFlags({ asset }: { asset: AssetHealth }) {
  return (
    <>
      {!asset.name_ok && (
        <Tag kind="warn" title="Doesn't follow RC26-R1-DRV-PART-v1">
          MESSY NAME
        </Tag>
      )}
      {asset.missing_exports && (
        <Tag kind="warn" title="A drive master needs a STEP and a PDF uploaded">
          {asset.has_step ? "NO PDF" : asset.has_pdf ? "NO STEP" : "NO EXPORTS"}
        </Tag>
      )}
    </>
  );
}

export function PageHead({
  kicker,
  title,
  sub,
  actions,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
        {sub && <div className="text-muted sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
      {children}
    </header>
  );
}

/** Every list has one: says what belongs here and how to add the first. */
export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <Box className="empty">
      <div className="empty-title">{title}</div>
      {body && <p className="text-muted">{body}</p>}
      {action && <div className="row" style={{ justifyContent: "center" }}>{action}</div>}
    </Box>
  );
}

export function LaneGrid({ lanes }: { lanes: LaneState[] }) {
  return (
    <div className="lanes">
      {lanes.map((l) => (
        <div key={l.code} className={`lane lane-${l.tone}`}>
          <div className="lane-code">{l.code}</div>
          <div className="lane-state">{l.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="text-muted small">{label}</div>
    </div>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`mono ${className}`}>{children}</span>;
}

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <Box dark className="code-block">
      {label && <div className="code-label">{label}</div>}
      <pre>{children}</pre>
    </Box>
  );
}

export function Notice({ result }: { result: { ok: boolean; message?: string } | null | undefined }) {
  if (!result?.message) return null;
  return <span className={result.ok ? "note-ok" : "note-err"}>{result.message}</span>;
}
