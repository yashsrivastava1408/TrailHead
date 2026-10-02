import { SKILLS, skillLabel } from './catalog.js';

const MAX_EVIDENCE_PER_SKILL = 4;
const MIN_LANGUAGE_SHARE = 0.05;

const LANGUAGE_TO_SKILLS = {
  JavaScript: ['javascript'],
  TypeScript: ['typescript', 'javascript'],
  Python: ['python'],
  Java: ['java'],
  HTML: ['html-css'],
  CSS: ['html-css'],
  SCSS: ['html-css'],
  Shell: ['linux'],
  'Jupyter Notebook': ['python', 'pandas'],
  'C++': ['cpp'],
  C: ['cpp'],
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One compiled regex per skill. Boundaries stop "java" matching inside "javascript".
const SKILL_MATCHERS = Object.entries(SKILLS).map(([id, def]) => ({
  id,
  regex: new RegExp(`(?<![a-z0-9+])(?:${def.aliases.map((a) => escapeRegex(a.toLowerCase())).join('|')})(?![a-z0-9+])`, 'gi'),
}));

// "I would rather avoid DSA" must not count as DSA experience. A negating phrase,
// then at most three plain words (no "but", "and", punctuation), right before the match.
const NEGATORS = "avoid\\w*|dislike\\w*|hate\\w*|rather not|don'?t (?:like|want|know|use)|not a fan of|no experience (?:with|in|of)|never used|without|unfamiliar with|not good at|afraid of|scared of";
const NEGATION_BEFORE = new RegExp(`(?:${NEGATORS})(?:[ \\t-]+(?!(?:but|and|or|now|yet|though|however|while)\\b)\\w+){0,3}[ \\t-]*$`, 'i');
const isNegated = (text, index) => NEGATION_BEFORE.test(text.slice(Math.max(0, index - 40), index));

/** Returns a Map of skill id -> the exact word that matched, for all catalog skills in free text. */
export function matchSkills(text) {
  const found = new Map();
  if (!text) return found;
  for (const { id, regex } of SKILL_MATCHERS) {
    for (const hit of text.matchAll(regex)) {
      if (!isNegated(text, hit.index)) {
        found.set(id, hit[0]);
        break;
      }
    }
  }
  return found;
}

/** Returns the ids of all catalog skills mentioned in free text. */
export const detectSkills = (text) => new Set(matchSkills(text).keys());

const hasFile = (files, ...names) => names.some((n) => files.some((f) => f.toLowerCase() === n));
const hasFileLike = (files, pattern) => files.some((f) => pattern.test(f.toLowerCase()));

/** Skills implied by the files at the top of a repo. */
function skillsFromFiles(repo) {
  const out = [];
  const add = (skill, why) => out.push([skill, `${repo.name}: ${why}`]);
  const f = repo.rootFiles;
  if (hasFile(f, 'dockerfile', 'docker-compose.yml', 'docker-compose.yaml')) add('docker', 'has a Dockerfile');
  if (repo.hasWorkflows) add('ci-cd', 'has GitHub Actions workflows');
  if (hasFile(f, 'test', 'tests', '__tests__', 'spec', 'cypress', 'pytest.ini') || hasFileLike(f, /^(jest|vitest)\.config/)) add('testing', 'has a tests folder or test config');
  if (hasFile(f, 'package.json')) add('nodejs', 'has package.json');
  if (hasFile(f, 'requirements.txt', 'pyproject.toml')) add('python', 'has Python dependency file');
  if (hasFile(f, 'pom.xml', 'build.gradle')) add('java', 'has a Java build file');
  if (repo.homepage) add('cloud', `deployed at ${repo.homepage}`);
  if (hasFile(f, 'readme.md')) add('docs', 'has a README');
  return out;
}

/**
 * Turns raw GitHub data and optional resume text into a profile.
 * Every skill carries the evidence that proves it, so later steps can cite it
 * and a checker can reject claims that have no evidence.
 */
export function buildProfile({ evidence, resumeText = '' }) {
  const bySkill = new Map();
  const add = (skill, why) => {
    if (!SKILLS[skill]) return;
    const list = bySkill.get(skill) ?? [];
    if (list.length < MAX_EVIDENCE_PER_SKILL && !list.includes(why)) list.push(why);
    bySkill.set(skill, list);
  };

  for (const repo of evidence.repos) {
    const total = Object.values(repo.languages).reduce((a, b) => a + b, 0) || 1;
    for (const [lang, bytes] of Object.entries(repo.languages)) {
      if (bytes / total < MIN_LANGUAGE_SHARE) continue;
      for (const skill of LANGUAGE_TO_SKILLS[lang] ?? []) add(skill, `${repo.name}: written partly in ${lang}`);
    }
    for (const topic of repo.topics) {
      for (const skill of detectSkills(topic)) add(skill, `${repo.name}: topic "${topic}"`);
    }
    for (const [skill, word] of matchSkills(repo.name)) add(skill, `${repo.name}: repo name contains "${word}"`);
    for (const [skill, word] of matchSkills(repo.description)) add(skill, `${repo.name}: description mentions "${word}"`);
    for (const [skill, why] of skillsFromFiles(repo)) add(skill, why);
  }

  for (const [skill, word] of matchSkills(resumeText)) add(skill, `resume mentions "${word}"`);

  const skills = [...bySkill.entries()].map(([id, ev]) => ({ id, label: skillLabel(id), evidence: ev }));
  const repos = evidence.repos.map(({ name, description, language, stars, homepage, topics, pushedAt }) => ({
    name, description, language, stars, homepage, topics, pushedAt,
  }));

  return {
    username: evidence.user.login,
    name: evidence.user.name,
    publicRepos: evidence.user.publicRepos,
    repos,
    skills,
    signals: {
      hasTests: bySkill.has('testing'),
      hasCI: bySkill.has('ci-cd'),
      hasDocker: bySkill.has('docker'),
      deployedProjects: evidence.repos.filter((r) => r.homepage).length,
      resumeProvided: resumeText.trim().length > 0,
    },
    // Too little to judge fairly: the UI says so instead of guessing.
    lowEvidence: evidence.repos.length < 2 || skills.length < 4,
  };
}
