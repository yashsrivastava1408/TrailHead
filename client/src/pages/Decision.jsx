import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Trophy } from 'lucide-react';
import { Banner, Bar, Card, Chip, PageHead } from '../components/ui.jsx';
import { useSession } from '../lib/SessionContext.jsx';
import { api } from '../lib/api.js';

const PARTS = [
  ['fit', 'Fit with your work', ''],
  ['performance', 'Trial score', 'blue'],
  ['enjoyment', 'Enjoyment', 'amber'],
];

export default function Decision() {
  const { session, decide } = useSession();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Read-only: nothing is saved until the student confirms below.
  useEffect(() => {
    let live = true;
    api.previewDecision(session.id)
      .then((d) => { if (live) { setPreview(d); setPicked(d.chosenPath ?? d.recommended); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [session.id, session.trials.length]);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await decide(picked);
      navigate('/plan');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!preview) return <PageHead title="Your decision" subtitle={error || 'Working it out…'} />;
  const w = preview.weights;

  return (
    <>
      <PageHead step="Step 4 · Decision" title="Your decision" subtitle={`${preview.reason} You can pick a different path if your gut says so.`} />
      {error && <Banner tone="error" title="Could not save">{error}</Banner>}

      <div className="stack lg">
        {preview.options.map((o, i) => (
          <Card key={o.pathId} className={`lift reveal option ${picked === o.pathId ? 'picked' : ''}`} style={{ '--i': i, background: picked === o.pathId ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255, 255, 255, 0.02)', borderColor: picked === o.pathId ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)' }} onClick={() => setPicked(o.pathId)}>
            <div className="spread">
              <label className="check" style={{ margin: 0 }}>
                <input type="radio" name="path" checked={picked === o.pathId} onChange={() => setPicked(o.pathId)} /> <h2>{o.name}</h2>
                {o.pathId === preview.recommended && <Chip tone="good"><Trophy size={12} /> recommended</Chip>}
              </label>
              <strong style={{ fontSize: 22 }}>{o.combined}<span className="muted small">/100</span></strong>
            </div>
            <div className="grid cols-3" style={{ marginTop: 22 }}>
              {PARTS.map(([key, label, tone]) => (
                <div key={key}>
                  <div className="spread small" style={{ marginBottom: 8 }}><span className="muted">{label} <span className="muted">×{w[key]}</span></span><span>{o[key]}</span></div>
                  <Bar value={o[key]} tone={tone} />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <p className="muted small">Only paths you have tried are compared. Want another option? Take its taste test first.</p>
      <button className="btn primary" disabled={busy || !picked} onClick={confirm}>{busy ? 'Saving…' : 'Choose this path and build my plan'} <ArrowRight size={16} /></button>
    </>
  );
}
