import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, GitBranch, Star } from 'lucide-react';
import { Banner, Card, Chip, PageHead, Spinner } from '../components/ui.jsx';
import { useSession } from '../lib/SessionContext.jsx';

function Form({ onDone }) {
  const { analyze } = useSession();
  const [form, setForm] = useState({ githubUsername: '', resumeText: '', freeHours: 2, dislikesDsa: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await analyze({ ...form, githubUsername: form.githubUsername.trim(), freeHours: Number(form.freeHours) });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack lg reveal" onSubmit={submit}>
      {error && <Banner tone="error" title="Could not analyse">{error}</Banner>}
      <div>
        <label htmlFor="gh">GitHub username</label>
        <input id="gh" type="text" required placeholder="e.g. octocat" value={form.githubUsername} onChange={set('githubUsername')} autoComplete="off" />
        <p className="muted small" style={{ marginTop: 6 }}>Only your public repositories are read.</p>
      </div>
      <div>
        <label htmlFor="resume">Resume text <span className="muted">(optional, but it helps a lot)</span></label>
        <textarea id="resume" placeholder="Paste your resume here. It is used for this analysis and never shown back or shared." value={form.resumeText} onChange={set('resumeText')} />
      </div>
      <div className="grid cols-2">
        <div>
          <label htmlFor="hours">Free hours per day</label>
          <select id="hours" value={form.freeHours} onChange={set('freeHours')}>
            {[1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        <label className="check" style={{ marginTop: 28 }}>
          <input type="checkbox" checked={form.dislikesDsa} onChange={set('dislikesDsa')} /> I would rather avoid DSA-heavy roles
        </label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy || !form.githubUsername.trim()}>{busy ? 'Reading your work…' : 'Analyse my work'} <ArrowRight size={16} /></button>
        {busy && <Spinner label="This can take 10–30 seconds" />}
      </div>
    </form>
  );
}

function Result({ session }) {
  const { profile } = session;
  return (
    <div className="stack lg fade">
      {profile.lowEvidence && <Banner title="Not much evidence">We found few public repos or skills. Results will be rough, so start over with resume text for a fairer picture.</Banner>}
      <div className="grid cols-2">
        <Card className="lift">
          <h2>Signals</h2>
          <div className="row" style={{ marginTop: 16 }}>
            <Chip tone={profile.signals.hasTests ? 'good' : 'warn'}>Tests: {profile.signals.hasTests ? 'yes' : 'none found'}</Chip>
            <Chip tone={profile.signals.hasCI ? 'good' : 'warn'}>CI: {profile.signals.hasCI ? 'yes' : 'none found'}</Chip>
            <Chip tone={profile.signals.hasDocker ? 'good' : 'warn'}>Docker: {profile.signals.hasDocker ? 'yes' : 'none found'}</Chip>
            <Chip tone="blue">{profile.signals.deployedProjects} deployed</Chip>
          </div>
        </Card>
        <Card className="lift">
          <h2>Repos read</h2>
          <div className="stack small" style={{ marginTop: 16 }}>
            {profile.repos.length === 0 && <span className="muted">No public repos found.</span>}
            {profile.repos.map((r) => (
              <div key={r.name} className="spread">
                <span><GitBranch size={14} style={{ verticalAlign: '-2px' }} /> {r.name} <span className="muted">{r.language ?? ''}</span></span>
                <span className="muted"><Star size={12} style={{ verticalAlign: '-1px' }} /> {r.stars}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <h2>Skills we can prove</h2>
        <p className="muted small" style={{ marginTop: 4 }}>Every skill below comes with evidence. If we cannot prove it, we do not claim it.</p>
        <div className="stack" style={{ marginTop: 14 }}>
          {profile.skills.length === 0 && <span className="muted">No skills detected yet.</span>}
          {profile.skills.map((s) => (
            <details key={s.id}>
              <summary style={{ cursor: 'pointer' }}><Chip tone="good">{s.label}</Chip> <span className="muted small">{s.evidence.length} piece{s.evidence.length > 1 ? 's' : ''} of evidence</span></summary>
              <ul className="clean small muted" style={{ marginTop: 8 }}>{s.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function Profile() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <PageHead step="Step 1 · Evidence" title="Your evidence" subtitle={session ? `Read from github.com/${session.githubUsername}` : 'We start from what you have built, not from a quiz.'}>
        {session && (
          <div className="row">
            <button className="btn ghost" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Re-analyse'}</button>
            <a className="btn ghost" href={`https://github.com/${session.githubUsername}`} target="_blank" rel="noreferrer">GitHub <ExternalLink size={14} /></a>
          </div>
        )}
      </PageHead>
      {(!session || editing) && <Form onDone={() => navigate('/paths')} />}
      {session && !editing && <Result session={session} />}
    </>
  );
}
