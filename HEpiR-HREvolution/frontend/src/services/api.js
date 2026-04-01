const BASE = '/api'

const cache = new Map()
const CACHE_TTL = 30000 // 30 seconds

export function clearCache() {
  cache.clear()
}

async function request(method, path, body) {
  const cacheKey = `${method}:${path}:${body ? JSON.stringify(body) : ''}`
  
  if (method === 'GET' && cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey)
    if (Date.now() - timestamp < CACHE_TTL) {
      return data
    }
  }

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
  
  const data = await res.json()
  
  if (method === 'GET') {
    cache.set(cacheKey, { data, timestamp: Date.now() })
  } else {
    // Mutation: clear cache to be safe, or we could be more granular
    cache.clear()
  }
  
  return data
}

// ── Jobs ──────────────────────────────────────────────────────────────────
export const getJobs = () => request('GET', '/jobs')
export const getInitData = () => request('GET', '/jobs/init')
export const getJob = (jobKey) => request('GET', `/jobs/${jobKey}`)
export const getJobCandidates = (jobKey) => request('GET', `/jobs/${jobKey}/candidates`)
export const updateJobStatus = (jobKey, status) => request('PATCH', `/jobs/${jobKey}/status`, { status })
export const getJobStages = (jobKey) => request('GET', `/jobs/${jobKey}/stages`)
export const createCustomStage = (jobKey, label, color) => request('POST', `/jobs/${jobKey}/stages`, { label, color })
export const deleteCustomStage = (jobKey, stageKey) => request('DELETE', `/jobs/${jobKey}/stages/${stageKey}`)
export const reorderCustomStages = (jobKey, order) => request('PATCH', `/jobs/${jobKey}/stages/reorder`, { order })
export const getPresetStages = (jobKey) => request('GET', `/jobs/${jobKey}/stages/presets`)

// ── Candidates ────────────────────────────────────────────────────────────
export const getCandidate = (profileKey) => request('GET', `/candidates/${profileKey}`)
export const getCandidateScore = (profileKey, jobKey) =>
  request('GET', `/candidates/${profileKey}/score?job_key=${jobKey}`)
export const storeCandidateScore = (profileKey, jobKey, score, bonus = 0) =>
  request('POST', `/candidates/${profileKey}/score`, { job_key: jobKey, score, bonus })
export const updateBonus = (profileKey, jobKey, bonus) =>
  request('PATCH', `/candidates/${profileKey}/bonus`, { job_key: jobKey, bonus })
export const updateCandidateStage = (profileKey, jobKey, stage) =>
  request('PATCH', `/candidates/${profileKey}/stage`, { job_key: jobKey, stage })

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
  cache.clear()
  return res.json()
}

export const createJob = (data) => request('POST', '/jobs', data)

// ── AI ────────────────────────────────────────────────────────────────────
export async function transcribeAudio(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/ai/transcribe`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Transcription failed')
  }
  return res.json()
}

export const gradeCandidate = (jobKey, profileKey) =>
  request('POST', '/ai/grade', { job_key: jobKey, profile_key: profileKey })
export const getStoredSynthesis = (jobKey, profileKey) =>
  request('GET', `/ai/synthesis?job_key=${jobKey}&profile_key=${profileKey}`)
export const synthesizeCandidate = (jobKey, profileKey) =>
  request('POST', '/ai/synthesize', { job_key: jobKey, profile_key: profileKey })
export const askQuestions = (jobKey, profileKey) =>
  request('POST', '/ai/ask', { job_key: jobKey, profile_key: profileKey })
export const generateEmail = (jobKey, profileKey, guidelines = '') => {
  const params = new URLSearchParams({ job_key: jobKey })
  if (guidelines) params.append('guidelines', guidelines)
  return request('POST', `/candidates/${profileKey}/email/generate?${params.toString()}`)
}

// ── Extra Documents ────────────────────────────────────────────────────────
export const getExtraDocuments = (profileKey, jobKey) =>
  request('GET', `/candidates/${profileKey}/documents?job_key=${jobKey}`)
export const uploadExtraDocument = (profileKey, jobKey, filename, content) =>
  request('POST', `/candidates/${profileKey}/documents`, { job_key: jobKey, filename, content })

export async function uploadExtraDocumentFile(profileKey, jobKey, file) {
  const form = new FormData()
  form.append('job_key', jobKey)
  form.append('file', file)
  const res = await fetch(`${BASE}/candidates/${profileKey}/documents/file`, {
    method: 'POST',
    body: form
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Upload failed')
  }
  cache.clear()
  return res.json()
}
