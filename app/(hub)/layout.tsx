import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { NavLinks } from "@/components/nav-links";
import { SetupNotice } from "@/components/setup-notice";
import { Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase/env";

export default async function HubLayout({ children }: LayoutProps<"/">) {
  if (!isConfigured) return <SetupNotice />;

  const { member, isLead } = await requireMember();

  const links = [
    { href: "/", label: "Home" },
    { href: "/season", label: "Season" },
    { href: "/modules", label: "Modules" },
    { href: "/programming", label: "Programming" },
    { href: "/electronics", label: "Electronics" },
    { href: "/mechanical", label: "Mechanical" },
    { href: "/members", label: "Members" },
    { href: "/start", label: "Quick start" },
  ];

  return (
    <div className="shell">
      <header className="topnav">
        <Link href="/" className="brand">
          REC ROBOCON <span className="text-muted" style={{ fontWeight: 400 }}>/ archive</span>
        </Link>
        <NavLinks links={links} />
        <div className="spacer" />
        <form className="search" action="/search">
          <input className="input" name="q" placeholder="Search — RC26-R1-DRV, encoder, gripper…" aria-label="Search" style={{ fontSize: 13 }} />
        </form>
        <div className="me">
          <Tag kind={isLead ? "accent" : "neutral"}>{member.role.toUpperCase()}</Tag>
          <span className="text-muted">
            {displayName(member)}
            {member.batch ? ` · batch ${member.batch}` : ""}
          </span>
          <form action={signOut}>
            <button className="btn btn-ghost" type="submit" style={{ fontSize: 12.5 }}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
