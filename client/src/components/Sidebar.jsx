import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarCheck, Check, Compass, Cpu, FlaskConical, GitBranch, LayoutDashboard, Lock, RotateCcw, Scale } from 'lucide-react';
import { useSession } from '../lib/SessionContext.jsx';

/** Which steps are unlocked and which are finished, derived from the session. */
export function steps(session) {
  const analyzed = Boolean(session);
  const tried = (session?.trials.length ?? 0) > 0;
  const decided = Boolean(session?.chosenPath);
  const planned = Boolean(session?.plan);
  return [
    { to: '/', label: 'Overview', icon: LayoutDashboard, open: true },
    { to: '/profile', label: 'Your evidence', icon: GitBranch, open: true, done: analyzed },
    { to: '/paths', label: 'Paths', icon: Compass, open: analyzed, done: tried },
    { to: '/taste-test', label: 'Taste test', icon: FlaskConical, open: analyzed, done: decided },
    { to: '/decision', label: 'Decision', icon: Scale, open: tried, done: decided },
    { to: '/plan', label: '30-day plan', icon: CalendarCheck, open: decided, done: planned },
  ];
}

function Avatar({ username }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="avatar">{username[0].toUpperCase()}</span>;
  return <img className="avatar" src={`https://github.com/${username}.png?size=80`} alt="" onError={() => setBroken(true)} />;
}

export default function Sidebar() {
  const { session, config, reset } = useSession();
  const llm = config?.llm;
  const state = !llm ? 'offline' : !llm.configured ? 'nokey' : llm.modelAvailable === false ? 'nomodel' : 'ok';
  const LABEL = { offline: 'unreachable', nokey: 'no API key', nomodel: 'model not available to your key', ok: llm?.provider };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Compass size={19} /></span> Trailhead
      </div>

      <div className="nav-label">Your journey</div>
      <nav className="nav" aria-label="Main">
        {steps(session).map(({ to, label, icon: Icon, open, done }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${open ? '' : 'locked'}`}>
            <Icon size={18} />
            <span className="text">{label}</span>
            <span className="state">{!open ? <Lock size={14} /> : done ? <Check size={16} className="done" /> : null}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        {session && (
          <div className="user-card">
            <Avatar username={session.githubUsername} />
            <div>
              <strong>{session.profile.name}</strong>
              <span>@{session.githubUsername}</span>
            </div>
          </div>
        )}
        <div className="model-badge" title="Any OpenAI-compatible model can be swapped in with environment variables">
          <Cpu size={16} />
          <div>
            <strong>{llm ? llm.model : 'Server offline'}</strong>
            <span className="row" style={{ gap: 6 }}><i className={`dot ${state === 'ok' ? 'ok' : ''}`} />{LABEL[state]}</span>
          </div>
        </div>
        {session && <button className="btn ghost small" onClick={reset}><RotateCcw size={14} /> Start over</button>}
      </div>
    </aside>
  );
}
