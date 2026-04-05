import { useState, useEffect, useCallback, useRef } from 'react'
import { getJobCandidates, getCandidate, gradeCandidate, synthesizeCandidate, getJobStages } from '../services/api'
import { storage } from '../services/storage'
import UploadResumeModal from './UploadResumeModal'
import JobInfoModal from './JobInfoModal'
import StageManager from './StageManager'

function lsKey(jobKey) { return `hrflow_pending_candidates_${jobKey}` }
function getPendingKeys(jobKey) {
  try { return JSON.parse(localStorage.getItem(lsKey(jobKey)) || '[]') } catch { return [] }
}
function setPendingKeys(jobKey, keys) {
  localStorage.setItem(lsKey(jobKey), JSON.stringify(keys))
}
export function registerPendingCandidate(jobKey, profileKey) {
  const keys = getPendingKeys(jobKey)
  if (!keys.includes(profileKey)) setPendingKeys(jobKey, [...keys, profileKey])
}

function scoreBadgeClass(score) {
  if (score === null || score === undefined) return 'none'
  if (score >= 0.7) return 'high'
  if (score >= 0.45) return 'mid'
  return 'low'
}

function formatScore(score) {
  if (score === null || score === undefined) return '—'
  return `${Math.round(score * 100)}%`
}

const s = {
  root: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 28px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 28px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontWeight: 700,
    fontSize: '1.125rem',
    color: 'var(--text)',
    flex: 1,
  },
  searchWrap: {
    position: 'relative',
  },
  searchInput: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '7px 12px 7px 32px',
    fontSize: '.875rem',
    color: 'var(--text)',
    outline: 'none',
    width: 220,
  },
  searchIcon: {
    position: 'absolute',
    left: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    fontSize: 13,
    pointerEvents: 'none',
  },
  tableWrap: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 28px 28px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 16,
    tableLayout: 'fixed',
  },
  th: {
    textAlign: 'left',
    padding: '10px 16px',
    fontSize: '.8rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    borderBottom: '2px solid var(--border)',
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    position: 'sticky',
    top: 0,
    background: 'var(--bg)',
  },
  tr: (hovering, selected, rejected) => ({
    background: selected ? '#f0f7ff' : (hovering ? '#f8f9fa' : 'transparent'),
    cursor: 'pointer',
    transition: 'background 200ms var(--ease-out-expo)',
    ...(rejected && { opacity: 0.45, '--final-opacity': 0.45 }),
  }),
  td: {
    padding: '13px 16px',
    borderBottom: '1px solid var(--border)',
    overflow: 'hidden',
    fontSize: '.9375rem',
    verticalAlign: 'middle',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '.75rem',
    fontWeight: 700,
    flexShrink: 0,
    overflow: 'hidden',
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  nameText: {
    minWidth: 0,
    overflow: 'hidden',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: 'var(--text-muted)',
  },
  statusBadge: (status) => ({
    padding: '.55rem 1.1rem',
    borderRadius: 'var(--radius)',
    fontSize: '.875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
    background: status === 'open' ? '#e6f4ea' : status === 'on_hold' ? '#fef7e0' : '#fce8e6',
    color: status === 'open' ? '#1e7e34' : status === 'on_hold' ? '#b05d00' : '#d93025',
  }),
}

const STATUS_LABELS = {
  open: 'Ouvert',
  on_hold: 'En pause',
  closed: 'Fermé',
}

const STAGE_TRANSLATIONS = {
  applied: 'Candidature',
  interview: 'Entretien',
  screening: 'Présélection',
  technical_test: 'Test technique',
  offer: 'Offre envoyée',
  hired: 'Recruté',
  rejected: 'Rejeté',
}

function translateStage(stage, labels = {}) {
  if (!stage) return 'Inconnu'
  // 1. Local translations (builtin stages)
  if (STAGE_TRANSLATIONS[stage]) return STAGE_TRANSLATIONS[stage]
  // 2. Server labels (custom stages)
  if (labels[stage]) return labels[stage]
  // 3. Fallback
  if (stage.startsWith('custom_')) return stage.slice(7).replace(/_/g, ' ')
  return stage.replace(/_/g, ' ')
}

export default function JobView({ job, onSelectCandidate, processingProfiles = {}, refreshKey = 0, selectedProfileKey, onCandidateRefreshed, onProcessingChange, onJobStatusChange, candidateOverride, onScoreReady, onSynthesisReady }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [hovered, setHovered] = useState(null)
  const [stageFilter, setStageFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [showJobInfo, setShowJobInfo] = useState(false)
  const [showStageManager, setShowStageManager] = useState(false)
  const [localStatus, setLocalStatus] = useState(job?.status || 'open')
  const [sortBy, setSortBy] = useState('score')
  const [stageOrder, setStageOrder] = useState({})
  const [stageLabels, setStageLabels] = useState({})
  const [animatingJobKey, setAnimatingJobKey] = useState(null)

  const selectedProfileKeyRef = useRef(selectedProfileKey)
  const onCandidateRefreshedRef = useRef(onCandidateRefreshed)
  const currentJobKeyRef = useRef(job?.key)
  const candidateOverrideRef = useRef(candidateOverride)
  
  useEffect(() => { selectedProfileKeyRef.current = selectedProfileKey }, [selectedProfileKey])
  useEffect(() => { onCandidateRefreshedRef.current = onCandidateRefreshed }, [onCandidateRefreshed])
  useEffect(() => { currentJobKeyRef.current = job?.key }, [job?.key])
  useEffect(() => { candidateOverrideRef.current = candidateOverride }, [candidateOverride])

  const fetchCandidates = useCallback(async () => {
    if (!job) return
    const fetchedForKey = job.key  // capture at call time
    
    // Only show full spinner if we have NO candidates in state
    const hadData = candidates.length > 0
    if (!hadData) {
      setLoading(true)
      setAnimatingJobKey(fetchedForKey)
    }

    try {
      void refreshKey
      const data = await getJobCandidates(job.key)
      let list = data.candidates || []
      const fetchedKeys = new Set(list.map((c) => c.profile_key))

      const pending = getPendingKeys(job.key)
      const stillPending = []
      await Promise.all(
        pending.map(async (key) => {
          if (fetchedKeys.has(key)) return
          try {
            const profile = await getCandidate(key)
            if (profile?.key) {
              const info = profile.info || {}
              const scoreTag = (profile.tags || []).find(t => t.name === `job_data_${job.key}`)
              let score = null, base_score = null, ai_adjustment = 0, bonus = 0
              if (scoreTag) {
                try {
                  const d = JSON.parse(scoreTag.value)
                  base_score = d.base_score ?? null
                  ai_adjustment = d.ai_adjustment ?? 0
                  bonus = d.bonus ?? 0
                  if (base_score !== null) score = base_score + ai_adjustment
                } catch (e) {}
              }

              list = [...list, {
                profile_key: key,
                first_name: info.first_name || '',
                last_name: info.last_name || '',
                email: info.email || '',
                picture: info.picture || '',
                base_score,
                ai_adjustment,
                score,
                bonus,
                stage: 'applied',
              }]
              stillPending.push(key)
            }
          } catch { stillPending.push(key) }
        })
      )
      // Discard results if the user has already switched to a different job
      if (currentJobKeyRef.current !== fetchedForKey) return
      setPendingKeys(job.key, stillPending)
      
      // If we have an active override, apply it to the freshly fetched list
      // This prevents the "flicker" where the list jumps back to stale HRFlow data before indexing finishes
      const override = candidateOverrideRef.current
      const finalCands = list.map(c => {
        if (override && c.profile_key === override.profileKey) {
          const patch = {}
          if (override.bonus !== undefined) patch.bonus = override.bonus
          if (override.stage !== undefined) patch.stage = override.stage
          if (override.synthesis !== undefined) patch.synthesis = override.synthesis
          if (override.base_score !== undefined) {
            patch.base_score = override.base_score
            patch.ai_adjustment = override.ai_adjustment ?? 0
            patch.score = override.base_score + (override.ai_adjustment ?? 0)
          }
          return { ...c, ...patch }
        }
        return c
      })

      setCandidates(finalCands)
      storage.set(`candidates_${job.key}`, finalCands)

      if (selectedProfileKeyRef.current) {
        const updated = finalCands.find((c) => c.profile_key === selectedProfileKeyRef.current)
        onCandidateRefreshedRef.current?.(updated || { profile_key: selectedProfileKeyRef.current })
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (currentJobKeyRef.current === fetchedForKey) setLoading(false)
    }
  }, [job, refreshKey])

  useEffect(() => {
    if (job?.key) {
      const cached = storage.get(`candidates_${job.key}`)
      if (cached) {
        setCandidates(cached)
        setAnimatingJobKey(null) // Don't animate if we have cached data
      } else {
        setCandidates([])
        setAnimatingJobKey(job.key)
      }
    } else {
      setCandidates([])
      setAnimatingJobKey(null)
    }
    fetchCandidates()
    setLocalStatus(job?.status || 'open')
  }, [job?.key, job?.status])

  // Clear animation state after initial reveal to prevent re-triggering on updates
  useEffect(() => {
    if (animatingJobKey) {
      const t = setTimeout(() => setAnimatingJobKey(null), 1000)
      return () => clearTimeout(t)
    }
  }, [animatingJobKey])

  useEffect(() => {
    if (refreshKey > 0) fetchCandidates()
  }, [refreshKey, fetchCandidates])

  useEffect(() => {
    if (!candidateOverride) return
    setCandidates(prev => {
      const newList = prev.map(c => {
        if (c.profile_key !== candidateOverride.profileKey) return c
        const patch = {}
        if (candidateOverride.bonus !== undefined) patch.bonus = candidateOverride.bonus
        if (candidateOverride.stage !== undefined) patch.stage = candidateOverride.stage
        if (candidateOverride.synthesis !== undefined) patch.synthesis = candidateOverride.synthesis
        if (candidateOverride.base_score !== undefined) {
          patch.base_score = candidateOverride.base_score
          patch.ai_adjustment = candidateOverride.ai_adjustment ?? 0
          patch.score = candidateOverride.base_score + (candidateOverride.ai_adjustment ?? 0)
        }
        return { ...c, ...patch }
      })

      // Sync the selected candidate back to parent if it was updated
      if (selectedProfileKeyRef.current === candidateOverride.profileKey) {
        const updated = newList.find(c => c.profile_key === candidateOverride.profileKey)
        if (updated) onCandidateRefreshedRef.current?.(updated)
      }

      return newList
    })
  }, [candidateOverride])

  useEffect(() => {
    if (!job?.key) return
    getJobStages(job.key).then((data) => {
      const order = {}, labels = {}
      ;(data.stages || []).forEach((s, i) => { order[s.key] = i; labels[s.key] = s.label })
      setStageOrder(order)
      setStageLabels(labels)
    }).catch(() => {})
  }, [job?.key])

  const allStages = ['all', ...new Set(candidates.map((c) => c.stage).filter(Boolean))]

  const filtered = candidates.filter((c) => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase()
    const matchSearch = name.includes(search.toLowerCase())
    const matchStage = stageFilter === 'all' || c.stage === stageFilter
    return matchSearch && matchStage
  })

  const getTotal = (c) => c.score !== null && c.score !== undefined ? Math.min(1, c.score + (c.bonus || 0)) : null

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'score') {
      const ta = getTotal(a), tb = getTotal(b)
      if (ta === null && tb === null) return 0
      if (ta === null) return 1
      if (tb === null) return -1
      return tb - ta
    } else {
      const sa = a.stage || '', sb = b.stage || ''
      if (sa === 'rejected' && sb !== 'rejected') return 1
      if (sb === 'rejected' && sa !== 'rejected') return -1
      if (sa !== sb) {
        const oa = stageOrder[sa] ?? -1, ob = stageOrder[sb] ?? -1
        return ob - oa  // higher order index = more advanced = first
      }
      const ta = getTotal(a), tb = getTotal(b)
      if (ta === null && tb === null) return 0
      if (ta === null) return 1
      if (tb === null) return -1
      return tb - ta
    }
  })

  if (!job) {
    return (
      <div style={{ ...s.root, justifyContent: 'center', alignItems: 'center' }}>
        <div style={s.empty}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Sélectionnez un poste</div>
          <div style={{ fontSize: '.8125rem' }}>Choisissez un poste dans la barre latérale pour voir les candidats</div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={{ ...s.title, flex: 'none' }}>{job.name || job.key}</div>
        <div style={{ ...s.statusBadge(localStatus), marginLeft: 16 }} title={`Le poste est actuellement ${STATUS_LABELS[localStatus] || localStatus}`}>
          {STATUS_LABELS[localStatus] || localStatus}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => setShowJobInfo(true)} title="Voir les détails du poste">
            Infos
          </button>
          <button className="btn-secondary" onClick={() => setShowStageManager(true)}>
            Processus
          </button>
          <button className="btn-primary" onClick={() => setShowUpload(true)} disabled={loading}>
            Ajouter un candidat
          </button>
        </div>
      </div>

      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            placeholder="Rechercher des candidats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          style={{ ...s.searchInput, paddingLeft: 10, width: 160, cursor: 'pointer' }}
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          {allStages.map((st) => (
            <option key={st} value={st}>
              {st === 'all' ? 'Toutes les étapes' : translateStage(st, stageLabels)}
            </option>
          ))}
        </select>

        <button
          className="btn-ghost"
          onClick={() => setSortBy(s => s === 'score' ? 'status' : 'score')}
          title={sortBy === 'score' ? 'Trier par étape' : 'Trier par score'}
        >
          {sortBy === 'score' ? 'Score' : 'Étape'}
        </button>

        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} candidat{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div style={s.tableWrap}>
        {loading && candidates.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" />
          </div>
        ) : (candidates.length === 0) ? (
          <div style={s.empty}>Aucun candidat trouvé</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: '5%' }}>#</th>
                <th style={{ ...s.th, width: '38%' }}>Candidat</th>
                <th style={{ ...s.th, width: '27%' }}>Étape</th>
                <th style={{ ...s.th, width: '16%', textAlign: 'center' }}>Score</th>
                <th style={{ ...s.th, width: '14%', textAlign: 'center' }}>Bonus</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const initials = `${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}`.toUpperCase() || '?'
                const total = c.score !== null && c.score !== undefined
                  ? Math.min(1, c.score + (c.bonus || 0))
                  : null
                const isRejected = c.stage === 'rejected'
                return (
                  <tr
                    key={c.profile_key}
                    className={`candidate-row ${animatingJobKey ? 'anim-row' : ''}`}
                    style={{ ...s.tr(hovered === c.profile_key, selectedProfileKey === c.profile_key, isRejected), '--row-index': i }}
                    onClick={() => onSelectCandidate(c)}
                    onMouseEnter={() => setHovered(c.profile_key)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <td style={{ ...s.td, color: 'var(--text-muted)', fontSize: '.75rem' }}>{i + 1}</td>
                    <td style={s.td}>
                      <div style={s.nameCell}>
                        <div style={s.avatar}>
                          {c.picture
                            ? <img src={c.picture} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none' }} />
                            : initials}
                        </div>
                        <div style={s.nameText}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name}</div>
                          {processingProfiles[c.profile_key] && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: 'var(--accent)', marginTop: 2 }}>
                              <div className="spinner" style={{ width: 9, height: 9 }} />
                              {processingProfiles[c.profile_key]}
                            </div>
                          )}
                          {c.email && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={{
                        fontSize: '.75rem',
                        padding: '2px 10px',
                        borderRadius: 4,
                        background: '#f0f0f0',
                        textTransform: 'capitalize',
                        fontWeight: 500
                      }}>
                        {translateStage(c.stage, stageLabels)}
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span className={`score-badge ${scoreBadgeClass(total)}`}>
                        {formatScore(total)}
                      </span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      {c.bonus ? (
                        <span style={{ color: c.bonus > 0 ? '#1e7e34' : '#d93025', fontWeight: 600, fontSize: '.8rem' }}>
                          {c.bonus > 0 ? '+' : ''}{Math.round(c.bonus * 100)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showUpload && (
        <UploadResumeModal
          job={job}
          onClose={() => setShowUpload(false)}
          onSuccess={(data) => {
            setShowUpload(false)
            if (data?.profile_key) registerPendingCandidate(job.key, data.profile_key)
            fetchCandidates()
            if (data?.profile_key && onProcessingChange) {
              const profileKey = data.profile_key
              onProcessingChange(profileKey, 'Évaluation…')
              ;(async () => {
                try {
                  const gradeResult = await gradeCandidate(job.key, profileKey)
                  // If this candidate happens to be selected, update the parent state immediately
                  if (selectedProfileKeyRef.current === profileKey) {
                    onScoreReady?.({ 
                      profileKey,
                      base_score: gradeResult.base_score ?? null, 
                      ai_adjustment: gradeResult.ai_adjustment ?? 0 
                    })
                  }
                  
                  onProcessingChange(profileKey, 'Génération de la synthèse…')
                  const synth = await synthesizeCandidate(job.key, profileKey)
                  
                  if (selectedProfileKeyRef.current === profileKey && synth) {
                    onSynthesisReady?.(synth)
                  }
                } catch (e) {
                  console.error('background grade/synthesize failed:', e)
                } finally {
                  onProcessingChange(profileKey, 'Mise à jour du profil…')
                }
              })()
            }
          }}
        />
      )}

      {showJobInfo && (
        <JobInfoModal
          job={job}
          onClose={() => setShowJobInfo(false)}
        />
      )}

      {showStageManager && (
        <StageManager
          job={job}
          onClose={() => setShowStageManager(false)}
          onStatusChange={(status) => {
            setLocalStatus(status)
            onJobStatusChange?.(job.key, status)
          }}
        />
      )}
    </div>
  )
}
