import { AppError } from '../errors.js';

const API = 'https://api.github.com';
const MAX_REPOS = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Small GitHub client. Fetches only public data for one user:
 * profile, recent own repos, languages and the names of root files.
 * Results are cached for 10 minutes (the unauthenticated limit is 60 calls/hour).
 */
export function createGithubClient({ token = null, fetchImpl = fetch } = {}) {
  const cache = new Map();

  async function get(path, { optional = false } = {}) {
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now()) return hit.value;

    const res = await fetchImpl(`${API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'trailhead',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (res.status === 404 && optional) return null;
    if (res.status === 404) throw new AppError(404, 'GitHub user not found', 'github_not_found');
    if (res.status === 403 || res.status === 429) {
      throw new AppError(429, 'GitHub rate limit reached. Add GITHUB_TOKEN to server/.env or try again later.', 'github_rate_limit');
    }
    if (!res.ok) throw new AppError(502, `GitHub request failed (${res.status})`, 'github_error');

    const value = await res.json();
    cache.set(path, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  async function describeRepo(username, repo) {
    const base = `/repos/${username}/${repo.name}`;
    const [languages, root] = await Promise.all([
      get(`${base}/languages`, { optional: true }),
      get(`${base}/contents`, { optional: true }),
    ]);
    const rootFiles = Array.isArray(root) ? root.map((f) => f.name) : [];
    const workflows = rootFiles.includes('.github') ? await get(`${base}/contents/.github/workflows`, { optional: true }) : null;

    return {
      name: repo.name,
      description: repo.description ?? '',
      topics: repo.topics ?? [],
      language: repo.language ?? null,
      languages: languages ?? {},
      homepage: repo.homepage || null,
      stars: repo.stargazers_count ?? 0,
      pushedAt: repo.pushed_at,
      rootFiles,
      hasWorkflows: Array.isArray(workflows) && workflows.length > 0,
    };
  }

  return {
    async fetchEvidence(username) {
      const user = await get(`/users/${encodeURIComponent(username)}`);
      const list = await get(`/users/${encodeURIComponent(username)}/repos?per_page=30&sort=pushed`);
      const own = list.filter((r) => !r.fork && !r.archived).slice(0, MAX_REPOS);
      const repos = await Promise.all(own.map((r) => describeRepo(user.login, r)));
      return {
        user: { login: user.login, name: user.name ?? user.login, publicRepos: user.public_repos ?? list.length },
        repos,
      };
    },
  };
}
