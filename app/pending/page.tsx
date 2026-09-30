import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requestAccess, signOut } from "@/app/auth/actions";
import { Box } from "@/components/ui";
import { getViewer, isApproved } from "@/lib/auth";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (isApproved(viewer.member)) redirect("/");

  const { member, user } = viewer;

  return (
    <main className="auth-wrap">
      <Box className="auth-card">
        <div className="kicker">Signed in as {user.email}</div>
        {!member && (
          <>
            <h2 style={{ margin: 0 }}>No access yet</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              Your request was removed by a lead, or your account wasn&apos;t registered. You can ask again.
            </p>
            <form action={requestAccess}>
              <button className="btn btn-secondary" type="submit">
                Request access
              </button>
            </form>
          </>
        )}
        {member?.role === "pending" && (
          <>
            <h2 style={{ margin: 0 }}>Waiting for a lead</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              You&apos;re on the list. A lead will approve you as a member and set your batch year. Tell your
              department lead you&apos;ve signed in, then refresh this page.
            </p>
          </>
        )}
        {member?.role === "alum" && (
          <>
            <h2 style={{ margin: 0 }}>Alumni account</h2>
            <p className="text-muted" style={{ margin: 0 }}>
              Your account was moved to alum after graduating. Ask the current team lead if you need access again.
            </p>
          </>
        )}
        <form action={signOut}>
          <button className="btn btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </Box>
    </main>
  );
}
