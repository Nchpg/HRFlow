const BASE = '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ── Jobs ──────────────────────────────────────────────────────────────────
export const getJobs = () => request('GET', '/jobs')
export const getJob = (jobKey) => request('GET', `/jobs/${jobKey}`)
export const getJobCandidates = (jobKey) => request('GET', `/jobs/${jobKey}/candidates`)

// ── Candidates ────────────────────────────────────────────────────────────
export const getCandidate = (profileKey) => request('GET', `/candidates/${profileKey}`)
export const getCandidateScore = (profileKey, jobKey) =>
  request('GET', `/candidates/${profileKey}/score?job_key=${jobKey}`)
export const storeCandidateScore = (profileKey, jobKey, score, bonus = 0) =>
  request('POST', `/candidates/${profileKey}/score`, { job_key: jobKey, score, bonus })
export const updateBonus = (profileKey, jobKey, bonus) =>
  request('PATCH', `/candidates/${profileKey}/bonus`, { job_key: jobKey, bonus })

// ── Populate ──────────────────────────────────────────────────────────────
export async function uploadResume(file, jobKey) {
  const form = new FormData()
  form.append('file', file)
  if (jobKey) form.append('job_key', jobKey)
  const res = await fetch(`${BASE}/candidates/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export const createJob = (data) => request('POST', '/jobs', data)

// ── AI ────────────────────────────────────────────────────────────────────
export const gradeCandidate = (jobKey, profileKey) =>
  request('POST', '/ai/grade', { job_key: jobKey, profile_key: profileKey })
export const getStoredSynthesis = (jobKey, profileKey) =>
  request('GET', `/ai/synthesis?job_key=${jobKey}&profile_key=${profileKey}`)
export const synthesizeCandidate = (jobKey, profileKey) =>
  request('POST', '/ai/synthesize', { job_key: jobKey, profile_key: profileKey })
export const askQuestions = (jobKey, profileKey) =>
  request('POST', '/ai/ask', { job_key: jobKey, profile_key: profileKey })

// ── Extra Documents ────────────────────────────────────────────────────────
export const getExtraDocuments = (profileKey, jobKey) =>
  request('GET', `/candidates/${profileKey}/documents?job_key=${jobKey}`)
export const uploadExtraDocument = (profileKey, jobKey, filename, content) =>
  request('POST', `/candidates/${profileKey}/documents`, { job_key: jobKey, filename, content })
