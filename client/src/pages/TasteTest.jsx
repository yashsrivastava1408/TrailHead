import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { Banner, Card, Chip, PageHead, Skeleton, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useSession } from '../lib/SessionContext.jsx';

const RATINGS = [
  [1, 'Hated it'], [2, 'Meh'], [3, 'Okay'], [4, 'Liked it'], [5, 'Loved it'],
];

function Result({ trial }) {
  const f = trial.feedback;
  return (
    <Card className="fade">
      <div className="spread">
        <div>
          <div className="muted small">Your score</div>
          <div className="score-ring">{trial.score}<span className="muted small">/100</span></div>
        </div>
        <div className="row">
          {f.total && <Chip tone={f.right === f.total ? 'good' : 'warn'}>{f.right} of {f.total} correct</Chip>}
          <Chip tone="blue">Enjoyment {trial.enjoyment}/5</Chip>
        </div>
      </div>
      <p style={{ marginTop: 10 }}>{f.feedback}</p>

      {f.review && (
        <div className="stack" style={{ marginTop: 22 }}>
          {f.review.map((r, i) => (
            <div key={i} className="review" data-correct={r.isCorrect}>
              <div className="row" style={{ gap: 8 }}>
                <Chip tone={r.isCorrect ? 'good' : 'bad'}>{r.isCorrect ? 'Correct' : 'Not quite'}</Chip>
                <strong className="small">Question {i + 1}</strong>
              </div>
              <p className="small" style={{ marginTop: 8 }}>{r.question}</p>
              {!r.isCorrect && <p className="small muted" style={{ marginTop: 6 }}>You chose: {r.chosen}</p>}
              <p className="small" style={{ marginTop: 6 }}><span className="muted">Best answer:</span> {r.correctOption}</p>
              <p className="small muted" style={{ marginTop: 6 }}>{r.explanation}</p>
            </div>
          ))}
        </div>
      )}

      {!f.review && (f.strengths?.length > 0 || f.improvements?.length > 0) && (
        <div className="grid cols-2" style={{ marginTop: 22 }}>
          {f.strengths.length > 0 && <div><h3 className="muted small">Did well</h3><ul className="clean small">{f.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {f.improvements.length > 0 && <div><h3 className="muted small">To improve</h3><ul className="clean small">{f.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        </div>
      )}
    </Card>
  );
}

export default function TasteTest() {
  const { session, submitTrial } = useSession();
  const [params, setParams] = useSearchParams();
  const top = session.analysis.ranking.slice(0, 3);
  const pathId = top.some((p) => p.pathId === params.get('path')) ? params.get('path') : top[0].pathId;
  const trial = session.trials.find((t) => t.pathId === pathId);

  const [task, setTask] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [enjoyment, setEnjoyment] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setTask(null);
    setAnswers([]);
    setEnjoyment(0);
    setError('');
    api.getTask(session.id, pathId).then((t) => live && setTask(t)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [session.id, pathId]);

  const questions = task?.questions ?? [];
  const allAnswered = questions.length > 0 && answers.length === questions.length && answers.every((a) => a !== undefined);
  const choose = (qi, value) => setAnswers((prev) => { const next = [...prev]; next[qi] = value; return next; });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await submitTrial({ pathId, answers, enjoyment });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead step="Step 3 · Taste test" title="Taste test" subtitle="Answer three quick questions for each path (about 3 minutes), then rate how it felt. What you enjoy counts as much as what you are good at." />
      <div className="seg" role="tablist">
        {top.map((p) => (
          <button key={p.pathId} className={p.pathId === pathId ? 'on' : ''} onClick={() => setParams({ path: p.pathId })} role="tab" aria-selected={p.pathId === pathId}>
            {session.trials.some((t) => t.pathId === p.pathId) && <CheckCircle2 size={14} style={{ verticalAlign: '-2px' }} />} {p.name}
          </button>
        ))}
      </div>

      {error && <Banner tone="error" title="Something went wrong">{error}</Banner>}
      {!task && !error && <div className="stack"><Skeleton height={28} width="45%" /><Skeleton height={120} /></div>}

      {task && (
        <div className="stack lg fade">
          <Card>
            <div className="spread"><h2>{task.title}</h2><Chip><Clock size={12} /> ~{task.minutes} min</Chip></div>
            <p className="muted small" style={{ marginTop: 8 }}>{questions.length} questions. Pick the best answer for each, then rate how it felt.</p>
          </Card>

          {trial && <Result trial={trial} />}

          <form className="card stack lg" onSubmit={submit}>
            <div className="stack lg">
              <label>{trial ? 'Try again (your new answers replace the old ones)' : 'Select your answers'}</label>
              {questions.map((q, qi) => (
                <fieldset key={qi} className="question">
                  <legend>Question {qi + 1} of {questions.length}</legend>
                  <p style={{ fontWeight: 600, margin: '4px 0 0' }}>{q.brief}</p>
                  {q.starter && <pre className="code" style={{ marginTop: 12 }}>{q.starter}</pre>}
                  <div className="stack" style={{ marginTop: 14 }}>
                    {q.options.map((opt, i) => (
                      <label key={i} className={`card option ${answers[qi] === String(i) ? 'picked' : ''}`} style={{ padding: '16px', display: 'flex', gap: '14px', alignItems: 'flex-start', margin: 0 }}>
                        <input type="radio" name={`q${qi}`} value={String(i)} checked={answers[qi] === String(i)} onChange={(e) => choose(qi, e.target.value)} style={{ width: '20px', height: '20px', accentColor: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ fontSize: '15px', lineHeight: '1.5' }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div>
              <label>How much did you enjoy this?</label>
              <div className="seg">
                {RATINGS.map(([n, text]) => <button type="button" key={n} className={enjoyment === n ? 'on' : ''} onClick={() => setEnjoyment(n)}>{n} · {text}</button>)}
              </div>
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy || !allAnswered || !enjoyment}>{busy ? 'Checking…' : 'Submit for grading'}</button>
              
            </div>
          </form>

          {session.trials.length > 0 && <div><Link className="btn" to="/decision">See my decision <ArrowRight size={16} /></Link></div>}
        </div>
      )}
    </>
  );
}
