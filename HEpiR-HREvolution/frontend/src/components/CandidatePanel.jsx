import { useState, useEffect } from 'react'
import { getCandidate, synthesizeCandidate, getStoredSynthesis, updateBonus, getJobStages, updateCandidateStage } from '../services/api'
import AskAssistant from './AskAssistant'
import DocumentsTab from './DocumentsTab'

function scoreBadgeClass(score) {
  if (score === null || score === undefined) return 'none'
  if (score >= 0.7) return 'high'
  if (score >= 0.45) return 'mid'
  return 'low'
}

function getStageColor(color) {
  const colors = {
    gray: '#f5f5f5',
    blue: '#e3f2fd',
    indigo: '#e8eaf6',
    purple: '#f3e5f5',
    orange: '#fff3e0',
    green: '#e8f5e9',
    red: '#ffebee',
    teal: '#e0f2f1',
    cyan: '#e0f7fa',
    pink: '#fce4ec',
    amber: '#fff8e1',
    lime: '#f9fbe7',
    sky: '#e1f5fe',
    rose: '#fff1f1',
    violet: '#f5f3ff',
  }
  return colors[color] || '#f5f5f5'
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,.4)',
    zIndex: 100,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  drawer: {
    background: 'var(--surface)',
    width: 'min(700px, 95vw)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '18px 20px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    fontWeight: 700,
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '50%',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  name: { fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text)' },
  email: { fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 2 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: 'var(--text-muted)',
    lineHeight: 1,
    padding: 4,
    borderRadius: 4,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    padding: '0 20px',
    background: 'var(--surface)',
  },
  tab: (active) => ({
    padding: '10px 14px',
    fontSize: '.8125rem',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'color .1s',
    marginBottom: -1,
  }),
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: '.75rem',
    fontWeight: 600,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 8,
  },
  card: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 16px',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: (color) => ({
    fontSize: '.75rem',
    padding: '.2rem .6rem',
    borderRadius: 99,
    background: color || '#e8eaf6',
    color: '#333',
    fontWeight: 500,
  }),
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  bonusInput: {
    width: 70,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '4px 8px',
    fontSize: '.8rem',
    outline: 'none',
  },
  stageSelect: {
    fontSize: '.8rem',
    padding: '4px 8px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    cursor: 'pointer',
    outline: 'none',
    maxWidth: 140,
  },
}

export default function CandidatePanel({ candidateRef, job, onClose, onProcessingChange, processingStatus, onBonusSaved, onStageChange }) {
  const [profile, setProfile] = useState(null)
  const [synthesis, setSynthesis] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingSynth, setLoadingSynth] = useState(false)
  const [bonus, setBonus] = useState(Math.round((candidateRef?.bonus || 0) * 100))
  const [savedBonus, setSavedBonus] = useState(Math.round((candidateRef?.bonus || 0) * 100))
  const [bonusSaving, setBonusSaving] = useState(false)
  const [localScores, setLocalScores] = useState(null)
  const [stages, setStages] = useState([])
  const [currentStage, setCurrentStage] = useState(candidateRef?.stage || 'applied')
  const [stageUpdating, setStageUpdating] = useState(false)

  useEffect(() => {
    if (!candidateRef || !job) return
    setLoadingProfile(true)
    setLoadingSynth(true)
    setProfile(null)
    setSynthesis(null)
    setLocalScores(null)
    const b = Math.round((candidateRef.bonus || 0) * 100)
    setBonus(b)
    setSavedBonus(b)
    setCurrentStage(candidateRef.stage || 'applied')

    getCandidate(candidateRef.profile_key)
      .then(p => {
        setProfile(p)
        // If candidateRef was missing score/bonus (e.g. newly added), try to get from tags
        const scoreTag = (p.tags || []).find(t => t.name === `job_data_${job.key}`)
        if (scoreTag) {
          try {
            const d = JSON.parse(scoreTag.value)
            if (d.bonus !== undefined && d.bonus !== null && !candidateRef.bonus) {
              const b = Math.round(d.bonus * 100)
              setBonus(b)
              setSavedBonus(b)
            }
          } catch (e) {}
        }
      })
      .catch(console.error)
      .finally(() => setLoadingProfile(false))

    getStoredSynthesis(job.key, candidateRef.profile_key)
      .then(async (data) => {
        if (data) {
          setSynthesis(data)
        } else {
          const generated = await synthesizeCandidate(job.key, candidateRef.profile_key)
          if (generated) setSynthesis(generated)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSynth(false))
    
    getJobStages(job.key)
      .then(data => setStages(data.stages))
      .catch(console.error)
  }, [candidateRef?.profile_key, job?.key])

  const handleBonusSave = async () => {
    if (!job || !candidateRef) return
    setBonusSaving(true)
    try {
      await updateBonus(candidateRef.profile_key, job.key, (parseFloat(bonus) || 0) / 100)
      setSavedBonus(parseFloat(bonus) || 0)
      onBonusSaved?.((parseFloat(bonus) || 0) / 100)
    } catch (e) {
      console.error(e)
    } finally {
      setBonusSaving(false)
    }
  }

  const handleStageChange = async (newStage) => {
    if (!job || !candidateRef) return
    setStageUpdating(true)
    try {
      await updateCandidateStage(candidateRef.profile_key, job.key, newStage)
      setCurrentStage(newStage)
      onStageChange?.(candidateRef.profile_key, newStage)
    } catch (e) {
      console.error(e)
    } finally {
      setStageUpdating(false)
    }
  }

  if (!candidateRef) return null

  const info = profile?.info || {}
  const pictureUrl = info.picture || null
  const initials = `${candidateRef.first_name?.[0] || ''}${candidateRef.last_name?.[0] || ''}`.toUpperCase() || '?'
  const fullName = `${candidateRef.first_name} ${candidateRef.last_name}`.trim()
  const scoreTag = (profile?.tags || []).find(t => t.name === `job_data_${job?.key}`)
  let tagBase = null, tagAi = 0
  if (scoreTag) {
    try {
      const d = JSON.parse(scoreTag.value)
      tagBase = d.base_score ?? null
      tagAi = d.ai_adjustment ?? 0
    } catch (e) {}
  }

  const effectiveBaseScore = localScores?.base_score ?? candidateRef.base_score ?? tagBase
  const effectiveAiAdj = localScores?.ai_adjustment ?? candidateRef.ai_adjustment ?? tagAi
  const totalScore = effectiveBaseScore !== null
    ? Math.min(1, Math.max(0, effectiveBaseScore + effectiveAiAdj + savedBonus / 100))
    : null

  const currentStageIdx = stages.findIndex(st => st.key === currentStage)

  return (
    <>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.drawer} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.avatar}>
              {pictureUrl
                ? <img src={pictureUrl} alt={fullName} style={s.avatarImg} onError={(e) => { e.target.style.display = 'none' }} />
                : initials}
            </div>
            <div style={s.headerInfo}>
              <div style={s.name}>{fullName || candidateRef.profile_key}</div>
              <div style={s.email}>{info.email || candidateRef.email || ''}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`score-badge ${scoreBadgeClass(totalScore)}`}>
                  {totalScore !== null ? `${Math.round(totalScore * 100)}%` : 'Not scored'}
                </span>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Stage:</span>
                  <select
                    style={s.stageSelect}
                    value={currentStage}
                    onChange={(e) => handleStageChange(e.target.value)}
                    disabled={stageUpdating}
                  >
                    {stages.map(st => (
                      <option key={st.key} value={st.key}>{st.label}</option>
                    ))}
                    {currentStageIdx === -1 && <option value={currentStage}>Unknown Stage</option>}
                  </select>
                </div>
              </div>
            </div>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>

          {/* Pipeline progress */}
          <PipelineProgress stages={stages} currentIdx={currentStageIdx} />

          {/* Processing status banner */}
          {!loadingProfile && (loadingSynth || processingStatus) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '7px 20px', fontSize: '.8rem', color: 'var(--accent)', background: '#f0f4ff', borderBottom: '1px solid var(--border)', lineHeight: 1 }}>
              <div className="spinner" style={{ width: 13, height: 13, flexShrink: 0, margin: 0 }} />
              <span>{loadingSynth ? 'Generating synthesis…' : processingStatus}</span>
            </div>
          )}

          {/* Tabs */}
          <div style={s.tabs}>
            {['overview', 'synthesis', 'scoring', 'documents', 'resume', 'ask'].map((tab) => (
              <div key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ ...s.body, overflow: activeTab === 'resume' || activeTab === 'documents' ? 'hidden' : 'auto', padding: activeTab === 'resume' || activeTab === 'documents' ? 0 : '20px' }}>
            {loadingProfile ? (
              <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab profile={profile} />
                )}
                {activeTab === 'synthesis' && (
                  <SynthesisTab synthesis={synthesis} loading={loadingSynth} />
                )}
                {activeTab === 'scoring' && (
                  <ScoringTab
                    hrflowScore={effectiveBaseScore}
                    aiAdjustment={effectiveAiAdj}
                    bonus={bonus}
                    savedBonus={savedBonus}
                    setBonus={setBonus}
                    onSaveBonus={handleBonusSave}
                    bonusSaving={bonusSaving}
                  />
                )}
                {activeTab === 'documents' && (
                  <DocumentsTab
                    profileKey={candidateRef.profile_key}
                    jobKey={job.key}
                    onGraded={async (result) => {
                      setLocalScores({ base_score: result.base_score ?? null, ai_adjustment: result.ai_adjustment ?? 0 })
                      onProcessingChange?.(candidateRef.profile_key, 'Generating synthesis…')
                      setLoadingSynth(true)
                      try {
                        const synth = await synthesizeCandidate(job.key, candidateRef.profile_key)
                        if (synth) setSynthesis(synth)
                      } catch (e) {
                        console.error('synthesis failed:', e)
                      } finally {
                        setLoadingSynth(false)
                        onProcessingChange?.(candidateRef.profile_key, null)
                      }
                    }}
                    onProcessingChange={onProcessingChange}
                  />
                )}
                {activeTab === 'resume' && (
                  <ResumeTab profile={profile} />
                )}
                {activeTab === 'ask' && (
                  <AskAssistant job={job} candidateRef={candidateRef} inline />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function PipelineProgress({ stages, currentIdx }) {
  // Built-in stages for progress line (exclude rejected and potentially too many custom stages)
  const displayStages = stages.filter(s => s.key !== 'rejected').slice(0, 8)
  const effectiveIdx = displayStages.findIndex(s => s.key === (stages[currentIdx]?.key))

  return (
    <div style={{ display: 'flex', padding: '10px 20px', gap: 0, background: '#fafafa', borderBottom: '1px solid var(--border)' }}>
      {displayStages.map((stage, i) => {
        const isDone = i < effectiveIdx
        const isActive = i === effectiveIdx
        const isPastOrActive = i <= effectiveIdx
        
        return (
          <div key={stage.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i < displayStages.length - 1 && (
              <div style={{
                position: 'absolute', top: 9, left: '50%', width: '100%',
                height: 2, background: isDone ? 'var(--accent)' : 'var(--border)',
                zIndex: 0,
              }} />
            )}
            <div style={{
              width: 20, height: 20, borderRadius: '50%', zIndex: 1,
              background: isDone ? 'var(--accent)' : (isActive ? 'linear-gradient(90deg, var(--accent) 50%, var(--border) 50%)' : 'var(--border)'),
              border: isActive ? '2px solid var(--accent)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxSizing: 'border-box'
            }}>
              {isDone && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
            </div>
            <div style={{ fontSize: '.65rem', color: isPastOrActive ? 'var(--accent)' : 'var(--text-muted)', marginTop: 4, fontWeight: isActive ? 700 : 400, textAlign: 'center' }}>
              {stage.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverviewTab({ profile }) {
  const skills = profile?.skills || []
  const experiences = profile?.experiences || []
  const educations = profile?.educations || []

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Skills</div>
        {skills.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>No skills found</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skills.map((sk, i) => (
              <span key={i} style={{ fontSize: '.75rem', padding: '.2rem .6rem', borderRadius: 99, background: '#e8eaf6', color: '#333', fontWeight: 500 }}>
                {sk.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {experiences.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Experience</div>
          {experiences.map((exp, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{exp.title}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{exp.company?.name} {exp.date_start ? `· ${exp.date_start?.slice(0,4)}` : ''}</div>
              {exp.description && <div style={{ fontSize: '.8rem', marginTop: 4, color: 'var(--text)' }}>{exp.description?.slice(0, 200)}{exp.description?.length > 200 ? '…' : ''}</div>}
            </div>
          ))}
        </div>
      )}

      {educations.length > 0 && (
        <div>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Education</div>
          {educations.map((edu, i) => (
            <div key={i} style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{edu.title}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{edu.school?.name} {edu.date_start ? `· ${edu.date_start?.slice(0,4)}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function SynthesisTab({ synthesis, loading }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
  if (!synthesis) return (
    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
      AI synthesis will appear here once generated.
    </div>
  )
  return (
    <>
      {synthesis.summary && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Summary</div>
          <div style={{ lineHeight: 1.6, color: 'var(--text)', padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            {synthesis.summary}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <ChipSection title="Strengths" items={synthesis.strengths} color="#d4edda" />
        <ChipSection title="Weaknesses" items={synthesis.weaknesses} color="#f8d7da" />
      </div>

      {synthesis.upskilling?.length > 0 && (
        <ChipSection title="Upskilling recommendations" items={synthesis.upskilling} color="#fff3cd" />
      )}
    </>
  )
}

function ChipSection({ title, items = [], color }) {
  if (!items?.length) return null
  return (
    <div>
      <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map((item, i) => (
          <span key={i} style={{ fontSize: '.75rem', padding: '.2rem .6rem', borderRadius: 99, background: color, color: '#333', fontWeight: 500 }}>
            {typeof item === 'object' ? (item.name || item.description || JSON.stringify(item)) : item}
          </span>
        ))}
      </div>
    </div>
  )
}

function ScoringTab({ hrflowScore, aiAdjustment, bonus, savedBonus, setBonus, onSaveBonus, bonusSaving }) {
  const totalScore = hrflowScore !== null && hrflowScore !== undefined
    ? Math.min(1, Math.max(0, hrflowScore + (aiAdjustment || 0) + savedBonus / 100))
    : null
  const fmt = (v) => v !== null && v !== undefined ? `${Math.round(v * 100)}%` : '—'
  const fmtAdj = (v) => {
    if (v === null || v === undefined) return '—'
    const pct = Math.round(v * 100)
    return pct > 0 ? `+${pct}%` : `${pct}%`
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Score breakdown</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'HRFlow Score', value: fmt(hrflowScore) },
            { label: 'AI Adjustment', value: fmtAdj(aiAdjustment) },
            { label: 'HR Bonus', value: savedBonus > 0 ? `+${savedBonus}%` : `${savedBonus}%` },
            { label: 'Total', value: fmt(totalScore), highlight: true },
          ].map((item) => (
            <div key={item.label} style={{ padding: '14px', background: item.highlight ? '#e8f4fd' : 'var(--bg)', border: `1px solid ${item.highlight ? '#b3d9f5' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: item.highlight ? 'var(--accent)' : 'var(--text)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>HR Bonus adjustment</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Manually override the candidate score. Value between −100 and +100.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface)' }}>
            <button
              style={{ background: 'none', border: 'none', padding: '7px 12px', fontSize: '1rem', cursor: 'pointer', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' }}
              onClick={() => setBonus(v => Math.max(-100, (parseInt(v) || 0) - 1))}
            >−</button>
            <input
              type="text"
              inputMode="decimal"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              style={{ width: 72, border: 'none', background: 'transparent', padding: '7px 8px', fontSize: '.875rem', outline: 'none', textAlign: 'center', color: 'var(--text)' }}
            />
            <button
              style={{ background: 'none', border: 'none', padding: '7px 12px', fontSize: '1rem', cursor: 'pointer', color: 'var(--text-muted)', borderLeft: '1px solid var(--border)' }}
              onClick={() => setBonus(v => Math.min(100, (parseInt(v) || 0) + 1))}
            >+</button>
          </div>
          <button className="btn-primary" onClick={onSaveBonus} disabled={bonusSaving} style={{ minWidth: 70 }}>
            {bonusSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResumeTab({ profile }) {
  const pdfUrl = profile?.attachments?.[0]?.public_url

  if (!pdfUrl) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
        No PDF attachment available for this profile.
      </div>
    )
  }

  return (
    <iframe
      src={pdfUrl}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 600,
        border: 'none',
        borderRadius: 'var(--radius)',
        display: 'block',
      }}
      title="Resume PDF"
    />
  )
}
