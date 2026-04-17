const BASE = '/api'

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw Object.assign(new Error(err.detail || res.statusText), { status: res.status, data: err })
  }
  return res.json()
}

export const api = {
  getAgents: () => request('GET', '/agents'),
  getAgent: (id) => request('GET', `/agents/${id}`),
  createAgent: (body) => request('POST', '/agents', body),
  updateAgent: (id, body) => request('PUT', `/agents/${id}`, body),
  deleteAgent: (id) => request('DELETE', `/agents/${id}`),

  chat: (id, body) => request('POST', `/agents/${id}/chat`, body),

  getTools: () => request('GET', '/tools'),

  getMistakes: (agentId) => request('GET', `/agents/${agentId}/mistakes`),
  createMistake: (agentId, body) => request('POST', `/agents/${agentId}/mistakes`, body),
  runFix: (mistakeId) => request('PUT', `/mistakes/${mistakeId}/fix`),

  health: () => request('GET', '/health'),
}
