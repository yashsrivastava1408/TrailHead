import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const STORAGE_KEY = 'trailhead.session';
export const SessionContext = createContext(null);

export const useSession = () => useContext(SessionContext);

/** Holds the student's session and the actions that change it. */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [config, setConfig] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return setBooting(false);
    api
      .getSession(id)
      .then(setSession)
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setBooting(false));
  }, []);

  const adopt = useCallback((next) => {
    setSession(next);
    localStorage.setItem(STORAGE_KEY, next.id);
    return next;
  }, []);

  const actions = useMemo(
    () => ({
      analyze: async (form) => adopt(await api.createSession(form)),
      submitTrial: async (body) => adopt(await api.submitTrial(session.id, body)),
      decide: async (pathId) => adopt(await api.decide(session.id, pathId)),
      createPlan: async () => adopt(await api.createPlan(session.id)),
      toggleDay: async (seq, done) => adopt(await api.setDayDone(session.id, seq, done)),
      replan: async () => adopt(await api.replan(session.id)),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      },
    }),
    [adopt, session?.id],
  );

  const value = useMemo(() => ({ session, config, booting, ...actions }), [session, config, booting, actions]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
