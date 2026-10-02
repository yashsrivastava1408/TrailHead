import { useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Wand2 } from 'lucide-react';
import { Banner, Card, Chip, Empty, PageHead, Ring, Spinner } from '../components/ui.jsx';
import { useSession } from '../lib/SessionContext.jsx';

const weekOf = (day) => Math.floor((day - 1) / 7) + 1;

function Day({ day, today, onToggle }) {
  const missed = !day.done && day.day < today;
  return (
    <div className={`day ${day.done ? 'done' : ''} ${day.day === today && !day.done ? 'today' : ''}`}>
      <input type="checkbox" checked={day.done} onChange={(e) => onToggle(day.seq, e.target.checked)} aria-label={`Mark ${day.title} as done`} />
      <span className="day-num">Day {day.day}</span>
      <div>
        <div className="day-title">{day.title}</div>
        <div className="muted small">{day.task}</div>
      </div>
      <div className="meta">
        <Chip>{day.minutes} min</Chip>
        {missed && <Chip tone="bad">missed</Chip>}
        {day.day === today && !day.done && <Chip tone="good">today</Chip>}
        {day.skill && <Chip tone="blue">{day.skill}</Chip>}
      </div>
    </div>
  );
}

export default function Plan() {
  const { session, createPlan, toggleDay, replan } = useSession();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const plan = session.plan;
  const chosen = session.analysis.ranking.find((r) => r.pathId === session.chosenPath);

  const run = (name, fn) => async (...args) => {
    setBusy(name);
    setError('');
    try { await fn(...args); } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  const weeks = useMemo(() => {
    const map = new Map();
    for (const d of plan?.days ?? []) {
      const w = weekOf(d.seq); // group by plan order so tasks never jump weeks after a re-plan
      map.set(w, [...(map.get(w) ?? []), d]);
    }
    return [...map.entries()];
  }, [plan]);

  if (!plan) {
    return (
      <>
        <PageHead step="Step 5 · Plan" title="Your 30-day plan" subtitle={`A day-by-day plan for ${chosen.name}, sized to ${session.freeHours}h a day.`} />
        {error && <Banner tone="error" title="Could not create the plan">{error}</Banner>}
        <Empty title="Ready when you are" text="We will start with the skills you are missing, then a small portfolio project, then interview prep.">
          <button className="btn primary" disabled={Boolean(busy)} onClick={run('create', createPlan)}><Wand2 size={16} /> {busy ? 'Writing your plan…' : 'Create my plan'}</button>
          {busy && <div style={{ marginTop: 12 }}><Spinner label="This can take 20–40 seconds" /></div>}
        </Empty>
      </>
    );
  }

  const percent = Math.round((plan.progress.done / plan.progress.total) * 100);
  const hasMissed = plan.days.some((d) => !d.done && d.day < plan.today);

  return (
    <>
      <PageHead step="Step 5 · Plan" title="Your 30-day plan" subtitle={`${chosen.name} · ${session.freeHours}h a day · Day ${plan.today} today`}>
        {hasMissed && <button className="btn" disabled={Boolean(busy)} onClick={run('replan', replan)}><RefreshCw size={16} className={busy === 'replan' ? 'spin' : ''} /> Adjust for missed days</button>}
      </PageHead>
      {error && <Banner tone="error" title="Something went wrong">{error}</Banner>}
      {session.planSource === 'fallback' && <Banner title="Template plan">The AI model could not write a plan{session.planNote ? ` (${session.planNote})` : ''}, so this one was built from a template.</Banner>}

      <Card className="row" style={{ gap: 28 }}>
        <Ring value={percent} size={92} stroke={8} />
        <div>
          <h2>{plan.progress.done} of {plan.progress.total} days complete</h2>
          <p className="muted small" style={{ marginTop: 6 }}><CalendarClock size={14} style={{ verticalAlign: '-2px' }} /> Day {plan.today} today. Tick tasks as you finish them.</p>
        </div>
      </Card>

      {weeks.map(([week, days]) => (
        <div className="week reveal" key={week} style={{ '--i': week }}>
          <h3>Week {week}</h3>
          {days.map((d) => <Day key={d.seq} day={d} today={plan.today} onToggle={toggleDay} />)}
        </div>
      ))}
    </>
  );
}
