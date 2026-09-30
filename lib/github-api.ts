// Server-only: reads GITHUB_TOKEN. Never import from a client component.
import { createHash } from "node:crypto";
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
  if (res.status === 422)
    throw new GithubError(
      `${full} already exists but the token can't see it — set the token's Repository access to "All repositories"`,
    );
  if (res.status === 403 || res.status === 404)
    throw new GithubError(
      `Can't create repos in ${githubOrg()}: the token needs Resource owner = ${githubOrg()} and Administration: Read and write — and an org owner may still need to approve it (Org → Settings → Personal access tokens → Pending requests)`,
    );
  if (res.status !== 201) throw explain(`Creating ${full}`, res.status, res.data);
  return { repo: full, created: true };
}

/** The sha git would give this content as a blob, to tell whether a file on GitHub already matches. */
export function gitBlobSha(content: string | Buffer) {
  const buf = typeof content === "string" ? Buffer.from(content) : content;
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

/**
 * One commit on the default branch adding the files that don't exist yet. Existing files are never
 * overwritten — except `managed` paths (the hub's own tooling), which are updated when they differ.
 */
export async function commitFiles(repo: string, files: RepoFile[], message: string, managed: string[] = []) {
  // Right after creation GitHub can briefly 404 the new repo.
  let info = await gh<{ default_branch: string }>(`/repos/${repo}`);
  for (let i = 0; info.status === 404 && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    info = await gh(`/repos/${repo}`);
  }
  if (info.status === 404)
    throw new GithubError(
      `${repo} doesn't exist, or the token can't see it — check the repo name on the season page, and that the token's Repository access is "All repositories"`,
    );
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
  const tree = await gh<{ tree: { path: string; sha: string }[] }>(`/repos/${repo}/git/trees/${commit.data.tree.sha}?recursive=1`);
  const existing = new Map((tree.data.tree ?? []).map((t) => [t.path, t.sha]));
  const todo = files.filter((f) =>
    !existing.has(f.path) ? true : managed.includes(f.path) && existing.get(f.path) !== gitBlobSha(f.content),
  );
  if (!todo.length) return { committed: 0 };

  const newTree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: commit.data.tree.sha,
      tree: todo.map((f) => ({ path: f.path, mode: f.executable ? "100755" : "100644", type: "blob", content: f.content })),
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

const HOOK_EVENTS = ["push", "pull_request"];

/** Install the webhook pointing at the hub once (push + pull request events); upgrade an older push-only one. */
export async function ensureWebhook(repo: string, url: string, secret: string) {
  const hooks = await gh<{ id: number; events: string[]; config: { url?: string } }[]>(`/repos/${repo}/hooks`);
  if (hooks.status !== 200) throw explain("Reading webhooks", hooks.status, hooks.data);
  const mine = hooks.data.find((h) => h.config.url === url);
  if (mine) {
    if (HOOK_EVENTS.every((e) => mine.events.includes(e))) return { created: false };
    const up = await gh(`/repos/${repo}/hooks/${mine.id}`, { method: "PATCH", body: JSON.stringify({ events: HOOK_EVENTS }) });
    if (up.status !== 200) throw explain("Updating the webhook", up.status, up.data);
    return { created: false };
  }
  const res = await gh(`/repos/${repo}/hooks`, {
    method: "POST",
    body: JSON.stringify({ name: "web", active: true, events: HOOK_EVENTS, config: { url, content_type: "json", secret, insecure_ssl: "0" } }),
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
  if (res.status === 403 && /upgrade|make this repository public/i.test((res.data as { message?: string } | null)?.message ?? ""))
    throw new GithubError("the free GitHub plan can't enforce this on a private repo — make it public or upgrade the org to GitHub Team");
  if (res.status !== 200) throw explain("Protecting main", res.status, res.data);
}

/** Replace README.md only if it is still GitHub's auto-generated two-line stub. */
export async function replaceStubReadme(repo: string, content: string) {
  const cur = await gh<{ sha: string; content: string }>(`/repos/${repo}/contents/README.md`);
  if (cur.status !== 200) return false;
  const text = Buffer.from(cur.data.content, "base64").toString("utf8").trim();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 2 || !lines[0]?.startsWith("# ")) return false; // someone wrote a real README
  const res = await gh(`/repos/${repo}/contents/README.md`, {
    method: "PUT",
    body: JSON.stringify({ message: "hub: season README", content: Buffer.from(content).toString("base64"), sha: cur.data.sha }),
  });
  if (res.status !== 200 && res.status !== 201) throw explain("Writing README.md", res.status, res.data);
  return true;
}

export function githubErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// ─── Proposals: branch + commit + pull request on behalf of a member ───────────

export type ProposedFile = { path: string; base64: string | null }; // null = deleted

export async function branchHead(repo: string, branch: string) {
  const ref = await gh<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${branch}`);
  return ref.status === 200 ? ref.data.object.sha : null;
}

export async function defaultBranch(repo: string) {
  const info = await gh<{ default_branch: string }>(`/repos/${repo}`);
  if (info.status !== 200) throw explain(`Reading ${repo}`, info.status, info.data);
  return info.data.default_branch;
}

/** Commit files on top of `parent`, then create or move `branch` to it. */
export async function commitToBranch(opts: {
  repo: string;
  parent: string;
  branch: string;
  create: boolean;
  files: ProposedFile[];
  message: string;
  author: { name: string; email: string };
}) {
  const { repo } = opts;
  const parent = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${opts.parent}`);
  if (parent.status !== 200) throw explain("Reading your starting point", parent.status, parent.data);

  const entries = [];
  for (const f of opts.files) {
    if (f.base64 === null) {
      entries.push({ path: f.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await gh<{ sha: string }>(`/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: f.base64, encoding: "base64" }),
    });
    if (blob.status !== 201) throw explain(`Uploading ${f.path}`, blob.status, blob.data);
    entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.data.sha });
  }

  const tree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.data.tree.sha, tree: entries }),
  });
  if (tree.status !== 201) throw explain("Building the commit", tree.status, tree.data);

  const commit = await gh<{ sha: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: opts.message, tree: tree.data.sha, parents: [opts.parent], author: { ...opts.author, date: new Date().toISOString() } }),
  });
  if (commit.status !== 201) throw explain("Creating the commit", commit.status, commit.data);

  const ref = opts.create
    ? await gh(`/repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${opts.branch}`, sha: commit.data.sha }) })
    : await gh(`/repos/${repo}/git/refs/heads/${opts.branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.data.sha, force: false }) });
  if (ref.status !== 201 && ref.status !== 200) throw explain(`Updating branch ${opts.branch}`, ref.status, ref.data);
  return commit.data.sha;
}

export type PullInfo = {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changed_files: number;
  head: { ref: string; sha: string };
};

export async function openPull(repo: string, opts: { title: string; head: string; base: string; body: string }) {
  const res = await gh<PullInfo>(`/repos/${repo}/pulls`, { method: "POST", body: JSON.stringify(opts) });
  if (res.status !== 201) throw explain("Opening the pull request", res.status, res.data);
  return res.data;
}

export async function getPull(repo: string, number: number) {
  const res = await gh<PullInfo>(`/repos/${repo}/pulls/${number}`);
  if (res.status !== 200) throw explain(`Reading pull request #${number}`, res.status, res.data);
  return res.data;
}

export type PullFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };

export async function pullFiles(repo: string, number: number) {
  const res = await gh<PullFile[]>(`/repos/${repo}/pulls/${number}/files?per_page=100`);
  if (res.status !== 200) throw explain(`Reading the changes in #${number}`, res.status, res.data);
  return res.data;
}

/** Merge commit (keeps each member's own commits and authorship in history). */
export async function mergePull(repo: string, number: number, title: string, message: string) {
  const res = await gh<{ merged: boolean; message?: string }>(`/repos/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "merge", commit_title: title, commit_message: message }),
  });
  if (res.status === 405 || res.status === 409)
    throw new GithubError("GitHub can't merge this automatically (it conflicts with main). Resolve it on GitHub, or ask the member to run ./hub.sh start and propose again.");
  if (res.status !== 200) throw explain(`Merging #${number}`, res.status, res.data);
}

export async function commentOnPull(repo: string, number: number, body: string) {
  const res = await gh(`/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  if (res.status !== 201) throw explain(`Commenting on #${number}`, res.status, res.data);
}

export async function closePull(repo: string, number: number) {
  const res = await gh(`/repos/${repo}/pulls/${number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  if (res.status !== 200) throw explain(`Closing #${number}`, res.status, res.data);
}

export async function deleteBranch(repo: string, branch: string) {
  await gh(`/repos/${repo}/git/refs/heads/${branch}`, { method: "DELETE" });
}
