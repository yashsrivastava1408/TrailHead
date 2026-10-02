import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Compass, FlaskConical, GitBranch, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { Banner, Bar, Card, Chip, CountUp, PageHead, Ring, Stat } from '../components/ui.jsx';
import { useSession } from '../lib/SessionContext.jsx';

const STEPS = [
  [GitBranch, 'Read your real work', 'We study your GitHub repos and resume instead of asking what you "like".'],
  [Compass, 'See your best-fit paths', 'Each path is scored from your own evidence, with what you are missing.'],
  [FlaskConical, 'Try before you pick', 'A 20-minute task for each top path. You rate how much you enjoyed it.'],
  [CalendarCheck, 'Get a 30-day plan', 'Daily tasks sized to your free time. It adjusts when you miss days.'],
];

const PROMISES = [
  [GitBranch, 'Evidence, not quizzes', 'Your fit comes from code you wrote, not from how you answer a personality test.'],
  [FlaskConical, 'Try before you pick', 'Do a real mini-task for each path and say how it felt. Enjoyment counts as much as skill.'],
  [ShieldCheck, 'AI that is fact-checked', 'The model explains your fit, but every claim is checked against your own evidence first.'],
];

function nextStep(session) {
  if (!session) return { to: '/profile', label: 'Start with your GitHub' };
  if (!session.trials.length) return { to: '/taste-test', label: 'Take your first taste test' };
  if (!session.chosenPath) return { to: '/decision', label: 'Make your decision' };
  if (!session.plan) return { to: '/plan', label: 'Create your 30-day plan' };
  return { to: '/plan', label: 'Continue your plan' };
}

function Landing() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow reveal"><Sparkles size={14} /> A placement guide for people who would rather not grind DSA</span>
        <h1 className="hero-title reveal" style={{ '--i': 1 }}>Try the path <span className="grad">before</span> you pick it.</h1>
        <p className="hero-sub reveal" style={{ '--i': 2 }}>
          Not sure which role fits you? Trailhead reads what you have actually built, lets you test-drive the options
          with real mini-tasks, and turns your choice into a 30-day plan.
        </p>
        <div className="hero-actions reveal" style={{ '--i': 3 }}>
          <Link className="btn primary lg" to="/profile">Get started <ArrowRight size={18} /></Link>
          <a className="btn ghost lg" href="#how">How it works</a>
        </div>
        <div className="metrics reveal" style={{ '--i': 4 }}>
          <div className="metric"><strong><CountUp value={8} /></strong><span>career paths scored</span></div>
          <div className="metric"><strong><CountUp value={20} /> min</strong><span>per taste test</span></div>
          <div className="metric"><strong><CountUp value={30} /> days</strong><span>adaptive plan</span></div>
        </div>
      </section>

      <section id="how">
        <div className="section-title">How it works</div>
        <div className="steps">
          {STEPS.map(([Icon, title, text], i) => (
            <Card key={title} className="step lift reveal" style={{ '--i': i }}>
              <span className="rank">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">Why it is different</div>
        <div className="grid cols-3">
          {PROMISES.map(([Icon, title, text], i) => (
            <Card key={title} className="lift reveal" style={{ '--i': i }}>
              <div className="feature-icon"><Icon size={22} /></div>
              <h3 style={{ marginBottom: 8 }}>{title}</h3>
              <p className="muted small" style={{ fontSize: 14 }}>{text}</p>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

export default function Overview() {
  const { session } = useSession();
  if (!session) return <Landing />;

  const top = session.analysis.ranking[0];
  const progress = session.plan?.progress;
  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const next = nextStep(session);
  const meta = session.analysis.meta;

  return (
    <>
      <PageHead step="Overview" title={`Hi ${session.profile.name}`} subtitle="Here is where you are on the way to a path you can actually enjoy.">
        <Link className="btn primary" to={next.to}>{next.label} <ArrowRight size={16} /></Link>
      </PageHead>

      {session.profile.lowEvidence && (
        <Banner title="Not much to go on yet">
          We found few public repos or skills, so these results are rough. Adding your resume text or pushing more projects will make them fairer.
        </Banner>
      )}
      {meta.usedFallback && (
        <Banner title="Plain-language explanations are simplified">
          The AI model was unavailable{meta.llmError ? ` (${meta.llmError})` : ''}, so the scores are real but the explanations are basic.
        </Banner>
      )}

      <div className="grid cols-4">
        <Stat index={0} icon={Sparkles} label="Skills found" value={session.profile.skills.length} hint={`${session.profile.repos.length} repos read`} />
        <Stat index={1} icon={Compass} label="Best fit so far" value={top.fit} suffix="%" hint={top.name} />
        <Stat index={2} icon={FlaskConical} label="Taste tests" value={session.trials.length} hint={session.chosenPath ? 'Path chosen' : 'Try 1–3 paths'} />
        <Stat index={3} icon={CalendarCheck} label="Plan progress" value={progress ? percent : '—'} suffix={progress ? '%' : ''} hint={progress ? `${progress.done} of ${progress.total} days` : 'Not started'} />
      </div>

      <div className="grid cols-2">
        <Card className="reveal" style={{ '--i': 4 }}>
          <div className="spread" style={{ marginBottom: 20 }}><h2><Target size={18} style={{ verticalAlign: '-3px', color: 'var(--accent)' }} /> Top paths for you</h2><Link className="muted small" to="/paths">See all</Link></div>
          <div className="stack lg">
            {session.analysis.ranking.slice(0, 3).map((r) => (
              <div key={r.pathId}>
                <div className="spread small" style={{ marginBottom: 8 }}><span>{r.name}</span><span className="muted">{r.fit}% fit</span></div>
                <Bar value={r.fit} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="reveal" style={{ '--i': 5 }}>
          <h2 style={{ marginBottom: 20 }}>Your journey</h2>
          <div className="stack">
            {[
              ['Evidence read', true],
              ['Taste test taken', session.trials.length > 0],
              ['Path chosen', Boolean(session.chosenPath)],
              ['30-day plan created', Boolean(session.plan)],
            ].map(([label, done]) => (
              <div key={label} className="row">
                <Chip tone={done ? 'good' : ''}>{done ? 'Done' : 'To do'}</Chip><span className={done ? '' : 'muted'}>{label}</span>
              </div>
            ))}
            {progress && <div style={{ marginTop: 8 }} className="row"><Ring value={percent} size={72} /><span className="muted small">{progress.done} of {progress.total} days complete</span></div>}
          </div>
        </Card>
      </div>
    </>
  );
}
