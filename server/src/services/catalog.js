import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

const skills = load('skills');
const paths = load('paths');
const tasks = load('tasks');

const pathById = new Map(paths.map((p) => [p.id, p]));
const taskByPath = new Map(tasks.map((t) => [t.pathId, t]));

export const SKILLS = skills;
export const PATHS = paths;
export const getPath = (id) => pathById.get(id) ?? null;
export const getTask = (pathId) => taskByPath.get(pathId) ?? null;
export const skillLabel = (id) => skills[id]?.label ?? id;
