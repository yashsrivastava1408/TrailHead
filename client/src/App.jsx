import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import { Skeleton } from './components/ui.jsx';
import { useSession } from './lib/SessionContext.jsx';

// Each page is its own chunk, so the first load only ships what the first screen needs.
const Overview = lazy(() => import('./pages/Overview.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Paths = lazy(() => import('./pages/Paths.jsx'));
const TasteTest = lazy(() => import('./pages/TasteTest.jsx'));
const Decision = lazy(() => import('./pages/Decision.jsx'));
const Plan = lazy(() => import('./pages/Plan.jsx'));

/** Sends the student back to an earlier step if this one is not unlocked yet. */
function Gate({ allowed, to, children }) {
  return allowed ? children : <Navigate to={to} replace />;
}

export default function App() {
  const { session, booting } = useSession();
  const { pathname } = useLocation();
  if (booting) return <main className="main"><div className="container"><Skeleton height={44} width="40%" /><Skeleton height={160} /></div></main>;

  const analyzed = Boolean(session);
  const tried = (session?.trials.length ?? 0) > 0;
  const decided = Boolean(session?.chosenPath);

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="container page-enter" key={pathname}>
        <Suspense fallback={<Skeleton height={200} />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/paths" element={<Gate allowed={analyzed} to="/profile"><Paths /></Gate>} />
            <Route path="/taste-test" element={<Gate allowed={analyzed} to="/profile"><TasteTest /></Gate>} />
            <Route path="/decision" element={<Gate allowed={tried} to="/taste-test"><Decision /></Gate>} />
            <Route path="/plan" element={<Gate allowed={decided} to="/decision"><Plan /></Gate>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </div>
      </main>
    </div>
  );
}
