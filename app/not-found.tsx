import Link from "next/link";
import { Box } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="auth-wrap">
      <Box className="auth-card">
        <div className="kicker">404</div>
        <h2 style={{ margin: 0 }}>Nothing recorded here</h2>
        <p className="text-muted" style={{ margin: 0 }}>It may have been deleted by a lead, or the link is from an older season.</p>
        <Link className="btn btn-secondary" href="/">Back to the hub</Link>
      </Box>
    </main>
  );
}
