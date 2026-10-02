import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { Banner, Card, Chip, PageHead, Ring } from '../components/ui.jsx';
import { useSession } from '../lib/SessionContext.jsx';

const DSA_TONE = { low: 'good', medium: 'warn', high: 'bad' };

export default function Paths() {
  const { session } = useSession();
  const { ranking, explanations, meta } = session.analysis;
  const explainById = new Map(explanations.map((e) => [e.pathId, e]));
  const tried = new Set(session.trials.map((t) => t.pathId));

  return (
    <>
      <PageHead step="Step 2 · Paths" title="Your best-fit paths" subtitle="Fit is the share of each path's skills you already show in your own work. It is calculated, not guessed." />
      {meta.usedFallback && <Banner title="Simplified explanations">The AI model was unavailable{meta.llmError ? ` (${meta.llmError})` : ''}. Scores are real; the wording is basic.</Banner>}

      <div className="stack lg">
        {ranking.map((r, i) => {
          const exp = explainById.get(r.pathId);
          const isTop = i < 3;
          return (
            <Card key={r.pathId} className={`path-card lift reveal ${isTop ? 'top' : ''}`} style={{ '--i': Math.min(i, 8) }}>
              <div className="spread">
                <div className="row"><span className="rank">{i + 1}</span><div className="stack" style={{ gap: 8 }}><h2>{r.name}</h2><div className="row"><Chip tone={DSA_TONE[r.dsaLevel]}>DSA: {r.dsaLevel}</Chip>{tried.has(r.pathId) && <Chip tone="blue"><CheckCircle2 size={12} /> tried</Chip>}</div></div></div>
                <div className="row"><span className="muted small">fit</span><Ring value={r.fit} size={isTop ? 68 : 54} /></div>
              </div>
              <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>{r.summary}</p>

              {isTop && exp && (
                <div className="stack lg" style={{ marginTop: 22 }}>
                  <p style={{ fontSize: 16 }}>{exp.summary}</p>
                  {exp.strengths.length > 0 && (
                    <div>
                      <h3 className="muted small">Why it fits (from your work)</h3>
                      <div className="stack" style={{ marginTop: 10 }}>
                        {exp.strengths.map((s) => <div key={s.skill}><Chip tone="good">{s.label}</Chip> <span className="evidence">{s.evidence}</span></div>)}
                      </div>
                    </div>
                  )}
                  {exp.gaps.length > 0 && (
                    <div>
                      <h3 className="muted small">What is missing</h3>
                      <div className="row" style={{ marginTop: 10 }}>{exp.gaps.map((g) => <Chip key={g.id} tone="warn">{g.label}</Chip>)}</div>
                    </div>
                  )}
                  <div><Link className="btn small" to={`/taste-test?path=${r.pathId}`}>Try this path <ArrowRight size={14} /></Link></div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <p className="muted small row"><Info size={14} /> Taste tests are offered for your top 3 paths. The DSA setting from your profile lowers the rank of DSA-heavy paths.</p>
    </>
  );
}
