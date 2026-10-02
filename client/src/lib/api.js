/** Thin fetch wrapper. Throws an Error whose message is the server's friendly message. */
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  config: () => request('GET', '/config'),
  getSession: (id) => request('GET', `/sessions/${id}`),
  createSession: (form) => request('POST', '/sessions', form),
  getTask: (id, pathId) => request('GET', `/sessions/${id}/tasks/${pathId}`),
  submitTrial: (id, body) => request('POST', `/sessions/${id}/trials`, body),
  previewDecision: (id) => request('GET', `/sessions/${id}/decision`),
  decide: (id, pathId) => request('POST', `/sessions/${id}/decision`, pathId ? { pathId } : {}),
  createPlan: (id) => request('POST', `/sessions/${id}/plan`),
  setDayDone: (id, seq, done) => request('PATCH', `/sessions/${id}/plan/days/${seq}`, { done }),
  replan: (id) => request('POST', `/sessions/${id}/plan/replan`),
};
