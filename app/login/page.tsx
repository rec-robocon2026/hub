import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/auth/actions";
import { SetupNotice } from "@/components/setup-notice";
import { Box, Corners } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!isConfigured) return <SetupNotice />;

  const { next, error } = await searchParams;
  if (await getViewer()) redirect(typeof next === "string" ? next : "/");

  return (
    <main className="auth-wrap">
      <Box className="auth-card">
        <div className="kicker">REC Robocon / archive</div>
        <h1 style={{ margin: 0 }}>Robocon Hub</h1>
        <p className="text-muted" style={{ margin: 0 }}>
          A living index of the club&apos;s robot, one season at a time: what exists, where it&apos;s stored and what
          state it&apos;s in.
        </p>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />
          <button className="btn btn-primary blueprint google-btn" type="submit">
            <Corners />
            <GoogleMark />
            Sign in with Google
          </button>
        </form>
        {typeof error === "string" && <div className="note-err">{error}</div>}
        <div className="text-muted small">
          Use your student Google account. New accounts wait for a lead to approve them.
        </div>
      </Box>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
    </svg>
  );
}
