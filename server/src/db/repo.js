import { randomUUID } from 'node:crypto';

const json = (value) => (value === undefined || value === null ? null : JSON.stringify(value));
const parse = (text) => (text ? JSON.parse(text) : null);

/**
 * All SQL lives here. Services and routes only see plain objects.
 * Statements are prepared once, then reused (cheap and safe from injection).
 */
export function createRepo(db) {
  const q = {
    insertSession: db.prepare(`INSERT INTO sessions
      (id, github_username, resume_text, free_hours, dislikes_dsa, status, profile, analysis, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'analyzed', ?, ?, ?, ?)`),
    getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    setDecision: db.prepare(`UPDATE sessions SET decision = ?, chosen_path = ?, status = 'decided', updated_at = ? WHERE id = ?`),
    setPlanStart: db.prepare(`UPDATE sessions SET status = 'planned', plan_started_at = ?, updated_at = ? WHERE id = ?`),
    upsertTrial: db.prepare(`INSERT INTO trials (session_id, path_id, answer, score, enjoyment, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, path_id) DO UPDATE SET
        answer = excluded.answer, score = excluded.score, enjoyment = excluded.enjoyment,
        feedback = excluded.feedback, created_at = excluded.created_at`),
    listTrials: db.prepare('SELECT * FROM trials WHERE session_id = ? ORDER BY created_at'),
    deletePlan: db.prepare('DELETE FROM plan_days WHERE session_id = ?'),
    insertDay: db.prepare(`INSERT INTO plan_days (session_id, seq, day, title, task, minutes, skill, done)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    listDays: db.prepare('SELECT * FROM plan_days WHERE session_id = ? ORDER BY seq'),
    setDone: db.prepare('UPDATE plan_days SET done = ? WHERE session_id = ? AND seq = ?'),
    setDay: db.prepare('UPDATE plan_days SET day = ? WHERE session_id = ? AND seq = ?'),
  };

  const tx = (fn) => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const toSession = (row) =>
    row && {
      id: row.id,
      githubUsername: row.github_username,
      resumeText: row.resume_text,
      freeHours: row.free_hours,
      dislikesDsa: Boolean(row.dislikes_dsa),
      status: row.status,
      profile: parse(row.profile),
      analysis: parse(row.analysis),
      decision: parse(row.decision),
      chosenPath: row.chosen_path,
      planStartedAt: row.plan_started_at,
      createdAt: row.created_at,
    };

  return {
    createSession({ githubUsername, resumeText, freeHours, dislikesDsa, profile, analysis }) {
      const id = randomUUID();
      const now = Date.now();
      q.insertSession.run(id, githubUsername, resumeText, freeHours, dislikesDsa ? 1 : 0, json(profile), json(analysis), now, now);
      return id;
    },

    getSession: (id) => toSession(q.getSession.get(id)),

    saveTrial({ sessionId, pathId, answer, score, enjoyment, feedback }) {
      q.upsertTrial.run(sessionId, pathId, answer, score, enjoyment, json(feedback), Date.now());
    },

    listTrials: (sessionId) =>
      q.listTrials.all(sessionId).map((r) => ({
        pathId: r.path_id,
        answer: r.answer,
        score: r.score,
        enjoyment: r.enjoyment,
        feedback: parse(r.feedback),
      })),

    saveDecision(sessionId, decision, chosenPath) {
      q.setDecision.run(json(decision), chosenPath, Date.now(), sessionId);
    },

    /** Replaces the whole plan atomically and marks the session as planned. */
    savePlan(sessionId, days) {
      tx(() => {
        q.deletePlan.run(sessionId);
        days.forEach((d, i) =>
          q.insertDay.run(sessionId, i + 1, d.day ?? i + 1, d.title, d.task, d.minutes, d.skill ?? '', d.done ? 1 : 0),
        );
        q.setPlanStart.run(Date.now(), Date.now(), sessionId);
      });
    },

    listDays: (sessionId) =>
      q.listDays.all(sessionId).map((r) => ({
        seq: r.seq,
        day: r.day,
        title: r.title,
        task: r.task,
        minutes: r.minutes,
        skill: r.skill,
        done: Boolean(r.done),
      })),

    setDayDone: (sessionId, seq, done) => q.setDone.run(done ? 1 : 0, sessionId, seq).changes > 0,

    /** Applies new schedule day numbers in one transaction. */
    reschedule(sessionId, assignments) {
      tx(() => assignments.forEach(({ seq, day }) => q.setDay.run(day, sessionId, seq)));
    },
  };
}
