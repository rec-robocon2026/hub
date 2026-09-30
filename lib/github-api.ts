// Server-only: reads GITHUB_TOKEN. Never import from a client component.
import type { RepoFile } from "@/lib/scaffold";

// Talks to GitHub as the club: creates season repos, commits scaffold folders, installs the webhook.
// Needs GITHUB_TOKEN — a fine-grained token on the org with Administration, Contents and Webhooks (read & write).

const API = "https://api.github.com";

export const githubOrg = () => process.env.GITHUB_ORG || "rec-robocon2026";
export const isGithubConfigured = () => Boolean(process.env.GITHUB_TOKEN);

class GithubError extends Error {}

async function gh<T = unknown>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, data };
}

function explain(what: string, status: number, data: unknown) {
  const msg = (data as { message?: string } | null)?.message ?? `HTTP ${status}`;
  if (status === 401) return new GithubError(`${what}: the GitHub token is invalid or expired`);
  if (status === 403 || status === 404) return new GithubError(`${what}: the GitHub token lacks permission (${msg})`);
  return new GithubError(`${what}: ${msg}`);
}

/** Create org/name if it doesn't exist. Returns "org/name". */
export async function ensureRepo(name: string, description: string) {
  const full = `${githubOrg()}/${name}`;
  const existing = await gh(`/repos/${full}`);
  if (existing.status === 200) return { repo: full, created: false };

  const res = await gh(`/orgs/${githubOrg()}/repos`, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: process.env.GITHUB_REPO_VISIBILITY !== "public",
      auto_init: true,
      has_wiki: false,
      delete_branch_on_merge: true,
    }),
  });
  if (res.status !== 201) throw explain(`Creating ${full}`, res.status, res.data);
  return { repo: full, created: true };
}

/** One commit on the default branch adding the files that don't exist yet. Existing files are never overwritten. */
export async function commitFiles(repo: string, files: RepoFile[], message: string) {
  const info = await gh<{ default_branch: string }>(`/repos/${repo}`);
  if (info.status !== 200) throw explain(`Reading ${repo}`, info.status, info.data);
  const branch = info.data.default_branch;

  // A freshly auto-initialised repo can take a moment before its first commit is visible.
  let ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${branch}`);
  for (let i = 0; ref.status !== 200 && i < 5; i++) {
    await new Promise((r) => setTimeout(r, 800));
    ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`);
  }
  if (ref.status !== 200) throw explain(`Reading ${repo}@${branch}`, ref.status, ref.data);
  const head = ref.data.object.sha;

  const commit = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${head}`);
  const tree = await gh<{ tree: { path: string }[] }>(`/repos/${repo}/git/trees/${commit.data.tree.sha}?recursive=1`);
  const existing = new Set((tree.data.tree ?? []).map((t) => t.path));
  const todo = files.filter((f) => !existing.has(f.path));
  if (!todo.length) return { committed: 0 };

  const newTree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: commit.data.tree.sha,
      tree: todo.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    }),
  });
  if (newTree.status !== 201) throw explain("Building the commit", newTree.status, newTree.data);

  const newCommit = await gh<{ sha: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.data.sha, parents: [head] }),
  });
  if (newCommit.status !== 201) throw explain("Creating the commit", newCommit.status, newCommit.data);

  const moved = await gh(`/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.data.sha }),
  });
  if (moved.status !== 200) throw explain(`Updating ${branch}`, moved.status, moved.data);
  return { committed: todo.length };
}

/** Install the push webhook pointing at the hub, once. */
export async function ensureWebhook(repo: string, url: string, secret: string) {
  const hooks = await gh<{ config: { url?: string } }[]>(`/repos/${repo}/hooks`);
  if (hooks.status !== 200) throw explain("Reading webhooks", hooks.status, hooks.data);
  if (hooks.data.some((h) => h.config.url === url)) return { created: false };
  const res = await gh(`/repos/${repo}/hooks`, {
    method: "POST",
    body: JSON.stringify({ name: "web", active: true, events: ["push"], config: { url, content_type: "json", secret, insecure_ssl: "0" } }),
  });
  if (res.status !== 201) throw explain("Creating the webhook", res.status, res.data);
  return { created: true };
}

/** main needs a pull request with one approval. Admins (the token owner) can still commit scaffolds. */
export async function protectMain(repo: string) {
  const info = await gh<{ default_branch: string }>(`/repos/${repo}`);
  const branch = info.data?.default_branch ?? "main";
  const res = await gh(`/repos/${repo}/branches/${branch}/protection`, {
    method: "PUT",
    body: JSON.stringify({
      required_status_checks: null,
      enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true },
      restrictions: null,
    }),
  });
  if (res.status !== 200) throw explain("Protecting main", res.status, res.data);
}

export function githubErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
