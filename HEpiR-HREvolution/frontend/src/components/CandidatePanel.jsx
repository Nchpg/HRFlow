import { useState, useEffect, useRef } from 'react'
import { getCandidate, synthesizeCandidate, getStoredSynthesis, updateBonus, getJobStages, updateCandidateStage, generateEmail, getExtraDocuments } from '../services/api'
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
  stageArrow: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 4,
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '1rem',
    color: 'var(--text)',
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
  },
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

function translateStage(stage, labels = []) {
  if (!stage) return 'Inconnu'
  // 1. Check local manual translations first (builtin stages)
  if (STAGE_TRANSLATIONS[stage]) return STAGE_TRANSLATIONS[stage]
  // 2. Then check the labels from the server (for custom stages)
  const found = labels.find(s => s.key === stage)
  if (found) return found.label
  // 3. Fallback for custom keys without labels
  if (stage.startsWith('custom_')) return stage.slice(7).replace(/_/g, ' ')
  return stage.replace(/_/g, ' ')
}

export default function CandidatePanel({ candidateRef, job, onClose, onProcessingChange, onScoreReady, onSynthesisReady, processingStatus, onBonusSaved, onStageChange }) {
  const [closing, setClosing] = useState(false)

  function handleClose() {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 280)
  }

  const [profile, setProfile] = useState(null)
  const [synthesis, setSynthesis] = useState(candidateRef?.synthesis || null)
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
  const [stageSaved, setStageSaved] = useState(false)
  const [stageError, setStageError] = useState(false)
  const committedStageRef = useRef(candidateRef?.stage || 'applied')
  const stageDebounceRef = useRef(null)
  const stageGenRef = useRef(0)
  const [docsRefreshKey, setDocsRefreshKey] = useState(0)

  // Use a ref to track the current profile key to detect changes without full state clear
  const prevProfileKeyRef = useRef(candidateRef?.profile_key)

  useEffect(() => {
    if (!candidateRef || !job) return
    const isNewProfile = prevProfileKeyRef.current !== candidateRef.profile_key
    prevProfileKeyRef.current = candidateRef.profile_key

    if (isNewProfile) {
      setLoadingProfile(true)
      setLoadingSynth(true)
      setProfile(null)
      setSynthesis(candidateRef.synthesis || null)
      setLocalScores(null)
      setActiveTab('overview')
    } else {
      // Profile is same, but candidateRef might have been updated (e.g. from synthesis or grading)
      if (candidateRef.synthesis && JSON.stringify(candidateRef.synthesis) !== JSON.stringify(synthesis)) {
        setSynthesis(candidateRef.synthesis)
        setLoadingSynth(false)
      }
    }

    // Clear local loading if we're now in "Updating profile" or finished
    if (processingStatus && processingStatus !== 'Generating synthesis…' && loadingSynth) {
      setLoadingSynth(false)
    }

    const b = Math.round((candidateRef.bonus || 0) * 100)
    setBonus(b)
    setSavedBonus(b)
    setCurrentStage(candidateRef.stage || 'applied')
    committedStageRef.current = candidateRef.stage || 'applied'
    if (stageDebounceRef.current) clearTimeout(stageDebounceRef.current)
    stageGenRef.current = 0

    Promise.all([
      getCandidate(candidateRef.profile_key),
      candidateRef.synthesis ? Promise.resolve(candidateRef.synthesis) : getStoredSynthesis(job.key, candidateRef.profile_key),
    ]).then(async ([p, storedSynthesis]) => {
        setProfile(p)
        // If candidateRef was missing bonus (e.g. newly added), try to get from tags
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

        if (storedSynthesis) {
          setSynthesis(storedSynthesis)
          setLoadingSynth(false)
          if (!candidateRef.synthesis) onSynthesisReady?.(storedSynthesis)
        } else if (scoreTag) {
          // Already graded but synthesis missing. 
          // Check if synthesis is already in flight (from another panel session)
          if (processingStatus === 'Génération de la synthèse…') {
            setLoadingSynth(true)
            return
          }

          onProcessingChange?.(candidateRef.profile_key, 'Génération de la synthèse…')
          setLoadingSynth(true)
          try {
            const generated = await synthesizeCandidate(job.key, candidateRef.profile_key)
            if (generated) {
              setSynthesis(generated)
              onSynthesisReady?.(generated)
            }
          } catch (e) {
            console.error(e)
          } finally {
            setLoadingSynth(false)
            onProcessingChange?.(candidateRef.profile_key, 'Mise à jour du profil…')
          }
        } else {
          // Not yet graded: synthesis will be generated via onGraded after the first grade run
          setLoadingSynth(false)
        }
      })
      .catch(console.error)
      .finally(() => { 
        setLoadingProfile(false)
        // Only clear loadingSynth if we're not waiting for an external synthesis
        if (processingStatus !== 'Generating synthesis…') {
          setLoadingSynth(false)
        }
      })
    
    getJobStages(job.key)
      .then(data => setStages(data.stages))
      .catch(console.error)
  }, [candidateRef, job?.key])

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

  const handleStageChange = (newStage) => {
    if (!job || !candidateRef) return
    setCurrentStage(newStage)
    setStageSaved(false)
    setStageError(false)

    if (stageDebounceRef.current) clearTimeout(stageDebounceRef.current)
    const gen = ++stageGenRef.current

    stageDebounceRef.current = setTimeout(async () => {
      setStageUpdating(true)
      try {
        await updateCandidateStage(candidateRef.profile_key, job.key, newStage)
        if (gen !== stageGenRef.current) return
        committedStageRef.current = newStage
        onStageChange?.(candidateRef.profile_key, newStage)
        setStageSaved(true)
        setTimeout(() => setStageSaved(false), 1400)
      } catch (e) {
        if (gen !== stageGenRef.current) return
        console.error(e)
        setCurrentStage(committedStageRef.current)
        setStageError(true)
        setTimeout(() => setStageError(false), 2000)
      } finally {
        if (gen === stageGenRef.current) setStageUpdating(false)
      }
    }, 400)
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
  const navStages = stages.filter(st => st.key !== 'rejected')
  const navIdx = navStages.findIndex(st => st.key === currentStage)

  return (
    <>
      <div style={s.overlay} className={closing ? 'anim-overlay-exit' : 'anim-overlay'} onClick={handleClose}>
        <div style={s.drawer} className={closing ? 'anim-drawer-exit' : 'anim-drawer'} onClick={(e) => e.stopPropagation()}>
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
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`score-badge ${scoreBadgeClass(totalScore)}`}>
                    {totalScore !== null ? `${Math.round(totalScore * 100)}%` : 'Non évalué'}
                  </span>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    style={{ ...s.stageArrow, opacity: (navIdx <= 0 || currentStage === 'rejected') ? 0.35 : 1 }}
                    disabled={navIdx <= 0 || currentStage === 'rejected'}
                    onClick={() => navIdx > 0 && handleStageChange(navStages[navIdx - 1].key)}
                  >‹</button>
                  <span style={{ fontSize: '.8rem', fontWeight: 500, color: currentStage === 'rejected' ? '#ef4444' : 'var(--text)', minWidth: 72, textAlign: 'center' }}>
                    {translateStage(currentStage, stages)}
                  </span>
                  <button
                    style={{ ...s.stageArrow, opacity: (navIdx >= navStages.length - 1 || currentStage === 'rejected') ? 0.35 : 1 }}
                    disabled={navIdx >= navStages.length - 1 || currentStage === 'rejected'}
                    onClick={() => navIdx < navStages.length - 1 && handleStageChange(navStages[navIdx + 1].key)}
                  >›</button>
                  <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <span style={{ fontSize: '.7rem', color: currentStage === 'rejected' ? '#ef4444' : 'var(--text-muted)' }}>Rejeter</span>
                    <span
                      role="switch"
                      aria-checked={currentStage === 'rejected'}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: 28,
                        height: 16,
                        borderRadius: 99,
                        background: currentStage === 'rejected' ? '#ef4444' : '#d1d5db',
                        transition: 'background 200ms',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                      onClick={() => handleStageChange(currentStage === 'rejected' ? 'applied' : 'rejected')}
                    >
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        left: currentStage === 'rejected' ? 14 : 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 200ms',
                        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                      }} />
                    </span>
                  </label>
                  <div style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {stageUpdating && <div className="spinner" style={{ width: 13, height: 13, margin: 0 }} />}
                    {stageSaved && !stageUpdating && <span key={currentStage} className="anim-confirm" style={{ fontSize: '.8rem', color: 'var(--score-high)', fontWeight: 700 }}>✓</span>}
                    {stageError && !stageUpdating && <span style={{ fontSize: '.8rem', color: '#ef4444', fontWeight: 700 }}>✕</span>}
                  </div>
                </div>
              </div>
            </div>
            <button style={s.closeBtn} onClick={handleClose}>✕</button>
          </div>

          {/* Pipeline progress — always rendered to reserve space, keyed to candidate */}
          <PipelineProgress
            key={candidateRef?.profile_key + '-pipeline'}
            stages={stages}
            currentIdx={currentStageIdx}
            onStageChange={handleStageChange}
          />

          {/* Processing and Tabs area — reserved space for banner to avoid flicker */}
          <div style={{ position: 'relative' }}>
            {((loadingSynth && !synthesis) || processingStatus) && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 33, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 20px', fontSize: '.8rem', color: 'var(--accent)', background: '#f0f4ff', borderBottom: '1px solid var(--border)', lineHeight: 1 }}>
                <div className="spinner" style={{ width: 13, height: 13, flexShrink: 0, margin: 0 }} />
                <span>{((loadingSynth && !synthesis) || processingStatus === 'Generating synthesis…') ? 'Génération de la synthèse…' : (processingStatus === 'Updating profile…' ? 'Mise à jour du profil…' : (processingStatus || 'Chargement…'))}</span>
              </div>
            )}

            {/* Tabs — keyed to candidateRef so animation replays per profile */}
            <div key={candidateRef?.profile_key + '-tabs'} style={{ ...s.tabs, paddingTop: ((loadingSynth && !synthesis) || processingStatus) ? 33 : 0 }}>
              {['overview', 'synthesis', 'scoring', 'documents', 'resume', 'email', 'ask'].map((tab, i) => (
                <div
                  key={tab}
                  className="anim-tab"
                  style={{ ...s.tab(activeTab === tab), '--tab-index': i }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'overview' ? 'Aperçu' :
                   tab === 'synthesis' ? 'Synthèse' :
                   tab === 'scoring' ? 'Évaluation' :
                   tab === 'documents' ? 'Documents' :
                   tab === 'resume' ? 'CV' :
                   tab === 'email' ? 'E-mail' :
                   tab === 'ask' ? 'Questions' : tab}                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ ...s.body, overflow: activeTab === 'resume' || activeTab === 'documents' ? 'hidden' : 'auto', padding: activeTab === 'resume' || activeTab === 'documents' ? 0 : '20px', ...(activeTab === 'scoring' ? { display: 'flex', flexDirection: 'column' } : {}) }}>
            {loadingProfile ? (
              <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
            ) : activeTab === 'documents' ? (
              <DocumentsTab
                profileKey={candidateRef.profile_key}
                jobKey={job.key}
                onGraded={async (result) => {
                  setLocalScores({ base_score: result.base_score ?? null, ai_adjustment: result.ai_adjustment ?? 0 })
                  onScoreReady?.({ base_score: result.base_score ?? null, ai_adjustment: result.ai_adjustment ?? 0 })
                  setDocsRefreshKey(k => k + 1)
                  onProcessingChange?.(candidateRef.profile_key, 'Génération de la synthèse…')
                  setLoadingSynth(true)
                  try {
                    const synth = await synthesizeCandidate(job.key, candidateRef.profile_key)
                    if (synth) {
                      setSynthesis(synth)
                      onSynthesisReady?.(synth)
                    }
                  } catch (e) {
                    console.error('synthesis failed:', e)
                  } finally {
                    setLoadingSynth(false)
                    onProcessingChange?.(candidateRef.profile_key, 'Mise à jour du profil…')
                  }
                }}
                onProcessingChange={onProcessingChange}
              />
            ) : activeTab === 'resume' ? (
              <ResumeTab profile={profile} />
            ) : activeTab === 'email' ? (
              <EmailTab job={job} candidateRef={candidateRef} />
            ) : (
              <div key={activeTab + candidateRef.profile_key} className="anim-content" style={activeTab === 'scoring' ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}>
                {activeTab === 'overview' && (
                  <OverviewTab profile={profile} />
                )}
                {activeTab === 'synthesis' && (
                  <SynthesisTab synthesis={synthesis} loading={loadingSynth || processingStatus === 'Generating synthesis…'} />
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
                    profileKey={candidateRef.profile_key}
                    jobKey={job.key}
                    refreshKey={docsRefreshKey}
                  />
                )}
                {activeTab === 'ask' && (
                  <AskAssistant job={job} candidateRef={candidateRef} inline />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// How many skeleton nodes to show while stages are loading
const SKELETON_NODES = 6

function PipelineProgress({ stages, currentIdx, onStageChange }) {
  const displayStages = stages.filter(s => s.key !== 'rejected').slice(0, 8)
  const effectiveIdx = displayStages.findIndex(s => s.key === stages[currentIdx]?.key)
  const isLoading = displayStages.length === 0

  // Track fill fires after nodes have had time to pop in
  const [trackFill, setTrackFill] = useState(false)
  useEffect(() => {
    if (isLoading) return
    const t = setTimeout(() => setTrackFill(true), 200)
    return () => clearTimeout(t)
  }, [isLoading])

  const progressPct = displayStages.length > 1
    ? (Math.max(0, effectiveIdx) / (displayStages.length - 1)) * 100
    : 0

  return (
    <div style={{ padding: '16px 24px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ position: 'relative', padding: '0 9px' }}>

        {/* Track background — always visible, gives instant structure */}
        <div style={{
          position: 'absolute',
          top: 9, left: 9, right: 9,
          height: 2,
          background: '#e5e7eb',
          borderRadius: 99,
          zIndex: 0,
        }} />

        {/* Track fill — draws after nodes pop in */}
        {!isLoading && (
          <div style={{
            position: 'absolute',
            top: 9, left: 9,
            height: 2,
            background: 'var(--accent)',
            borderRadius: 99,
            zIndex: 1,
            width: trackFill ? `${progressPct}%` : '0%',
            transition: 'width 700ms var(--ease-out-expo)',
            maxWidth: 'calc(100% - 18px)',
          }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
          {isLoading
            /* ── Skeleton: gray placeholder circles + label bars ── */
            ? Array.from({ length: SKELETON_NODES }).map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Circle — same dimensions as real node */}
                  <div style={{
                    width: 20, height: 20,
                    borderRadius: '50%',
                    background: '#e5e7eb',
                    border: '2px solid #e5e7eb',
                    flexShrink: 0,
                  }} />
                  {/* Label placeholder — same font metrics as real label so height is identical */}
                  <div style={{
                    marginTop: 6,
                    fontSize: '.6rem',
                    lineHeight: 1.55,
                    width: 28,
                    borderRadius: 4,
                    background: '#e5e7eb',
                    overflow: 'hidden',
                    color: 'transparent',
                    userSelect: 'none',
                  }}>&nbsp;</div>
                </div>
              ))
            /* ── Loaded: real nodes animate in with spring stagger ── */
            : displayStages.map((stage, i) => {
                const isDone   = i < effectiveIdx
                const isActive = i === effectiveIdx
                const isPast   = isDone || isActive

                return (
                  <div
                    key={stage.key}
                    className="pipeline-node"
                    style={{
                      '--node-index': i,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      cursor: isActive ? 'default' : 'pointer',
                    }}
                    onClick={() => !isActive && onStageChange(stage.key)}
                  >
                    <div style={{
                      width: 20, height: 20,
                      borderRadius: '50%',
                      background: isPast ? 'var(--accent)' : '#fff',
                      border: `2px solid ${isPast ? 'var(--accent)' : '#d1d5db'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: isActive ? '0 0 0 4px rgba(18, 100, 163, 0.15)' : 'none',
                      transition: 'box-shadow 400ms var(--ease-out-expo)',
                    }}>
                      {isDone && (
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                          <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.6"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {isActive && (
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                      )}
                    </div>

                    <div style={{
                      marginTop: 6,
                      fontSize: '.6rem',
                      fontWeight: isActive ? 600 : 400,
                      color: isPast ? 'var(--accent)' : '#9ca3af',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 60,
                      letterSpacing: isActive ? '.01em' : '0',
                      transition: 'color 300ms ease',
                    }}>
                      {translateStage(stage.key, stages)}
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ profile }) {
  const skills = profile?.skills || []
  const experiences = profile?.experiences || []
  const educations = profile?.educations || []

  return (
    <>
      <div className="anim-item" style={{ marginBottom: 20, '--item-index': 0 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          Compétence{skills.length > 1 ? 's' : ''} {skills.length > 0 && `(${skills.length})`}
        </div>
        {skills.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Aucune compétence trouvée</div>
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
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Expérience{experiences.length > 1 ? 's' : ''}
          </div>
          {experiences.map((exp, i) => (
            <div key={i} className="anim-item" style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8, '--item-index': i + 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{exp.title}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{exp.company?.name} {exp.date_start ? `· ${exp.date_start?.slice(0,4)}` : ''}</div>
              {exp.description && <div style={{ fontSize: '.8rem', marginTop: 4, color: 'var(--text)' }}>{exp.description?.slice(0, 200)}{exp.description?.length > 200 ? '…' : ''}</div>}
            </div>
          ))}
        </div>
      )}

      {educations.length > 0 && (
        <div>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Formation{educations.length > 1 ? 's' : ''}
          </div>
          {educations.map((edu, i) => (
            <div key={i} className="anim-item" style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8, '--item-index': experiences.length + i + 1 }}>
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
      La synthèse IA apparaîtra ici une fois générée.
    </div>
  )
  return (
    <>
      {synthesis.summary && (
        <div className="anim-item" style={{ marginBottom: 20, '--item-index': 0 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Résumé</div>
          <div style={{ lineHeight: 1.6, color: 'var(--text)', padding: '12px 14px', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            {synthesis.summary}
          </div>
        </div>
      )}

      <div className="anim-item" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20, '--item-index': 1 }}>
        <ChipSection title="Points forts" items={synthesis.strengths} color="#d4edda" />
        <ChipSection title="Points faibles" items={synthesis.weaknesses} color="#f8d7da" />
      </div>

      {synthesis.upskilling?.length > 0 && (
        <div className="anim-item" style={{ '--item-index': 2 }}>
          <ChipSection title="Recommandations de montée en compétences" items={synthesis.upskilling} color="#fff3cd" />
        </div>
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
          <span key={i} style={{ fontSize: '.75rem', padding: '4px 10px', borderRadius: 8, background: color, color: '#333', fontWeight: 500, lineHeight: 1.4, display: 'inline-block' }}>
            {typeof item === 'object' ? (item.name || item.description || JSON.stringify(item)) : item}
          </span>
        ))}
      </div>
    </div>
  )
}

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Score Evolution Graph
// ---------------------------------------------------------------------------

function ScoreEvolutionGraph({ profileKey, jobKey, baseScore, savedBonus, refreshKey }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    if (!profileKey || !jobKey) return
    setLoading(true)
    setAnimated(false)
    getExtraDocuments(profileKey, jobKey)
      .then(data => setDocs(data.documents || []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [profileKey, jobKey, refreshKey])

  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => setAnimated(true), 200)
    return () => clearTimeout(t)
  }, [loading])

  // Build chronological score timeline from documents
  const scoredDocs = [...docs]
    .filter(d => d.delta !== null && d.delta !== undefined)
    .sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))

  const points = []
  if (baseScore !== null && baseScore !== undefined) {
    points.push({
      score: Math.min(1, Math.max(0, baseScore + savedBonus / 100)),
      label: 'Base',
      date: null,
      delta: null,
      fullLabel: 'Score de base',
    })
    let runningAdj = 0
    for (const doc of scoredDocs) {
      runningAdj += doc.delta
      const clampedAdj = Math.min(0.3, Math.max(-0.3, runningAdj))
      points.push({
        score: Math.min(1, Math.max(0, baseScore + clampedAdj + savedBonus / 100)),
        label: (doc.filename || 'Doc').replace(/\.[^.]+$/, '').slice(0, 14),
        date: doc.uploaded_at,
        delta: doc.delta,
        fullLabel: doc.filename,
      })
    }
  }

  // SVG layout constants
  const H = 300
  const padL = 50, padR = 50, padT = 40, padB = 40
  const sidePadding = 60 // Space from the edge of the SVG to the first/last nodes
  const scrollThreshold = 7
  const stepW = 120 // Pixels between nodes when scrolling

  // Calculate plot area width
  const plotW = points.length > scrollThreshold
    ? (points.length - 1) * stepW
    : 440 // Fixed width for non-scrolling to keep it centered and tidy

  const W = plotW + padL + padR + (sidePadding * 2)
  const chartH = H - padT - padB

  // getX calculates the center-aligned X coordinate for each node
  const getX = (i) => {
    if (points.length <= 1) return W / 2
    return padL + sidePadding + i * (plotW / (points.length - 1))
  }
  const getY = (score) => padT + chartH * (1 - score)

  const pathD = points.length > 1
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(p.score).toFixed(1)}`).join(' ')
    : ''

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
        <div className="spinner" style={{ width: 24, height: 24, margin: 0 }} />
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', fontSize: '.875rem', color: 'var(--text-muted)' }}>
        Évaluez le candidat pour voir l'évolution du score.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{
        flex: 1,
        overflowX: points.length > scrollThreshold ? 'auto' : 'hidden',
        overflowY: 'hidden',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface)',
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start' // Align to top to match sticky container
      }}>
        {/* Sticky Y-axis labels overlay — height must match SVG exactly */}
        <div style={{
          position: 'sticky',
          left: 0,
          width: padL,
          height: H,
          marginRight: -padL,
          zIndex: 10,
          background: 'var(--surface)',
          borderRight: '1px dashed var(--border)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `${padT}px 0 ${padB}px 0`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
          flexShrink: 0
        }}>
          {[1, 0.5, 0].map(v => (
            <div key={v} style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textAlign: 'right',
              paddingRight: 10,
              fontFamily: 'var(--font-mono)',
              lineHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end'
            }}>
              {v * 100}%
            </div>
          ))}
        </div>

        {/* Scrollable Graph Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: points.length > scrollThreshold ? 'flex-start' : 'center',
          minWidth: 0
        }}>
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            style={{
              display: 'block',
              overflow: 'visible',
              flexShrink: 0
            }}
            aria-label="Évolution du score au fil du temps"          >
          {/* Y-axis reference lines at 0 / 50% / 100% across the whole width */}
          {[0, 0.5, 1].map(v => (
            <line
              key={v}
              x1={0} y1={getY(v).toFixed(1)}
              x2={W} y2={getY(v).toFixed(1)}
              stroke="var(--border)" strokeWidth="1"
              strokeDasharray={v === 0.5 ? '4 3' : undefined}
            />
          ))}

          {/* Base Score Anchor Reference Line (Always visible value anchor) */}
          {points.length > 0 && (
            <g>
              <line
                x1={0} y1={getY(points[0].score).toFixed(1)}
                x2={W} y2={getY(points[0].score).toFixed(1)}
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.25"
              />
            </g>
          )}

          {/* Animated connecting path */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={animated ? '0' : '1'}
              style={{ transition: 'stroke-dashoffset 800ms var(--ease-out-expo)' }}
            />
          )}

          {/* Nodes */}
          {points.map((p, i) => {
            const cx = getX(i)
            const cy = getY(p.score)
            const pct = Math.round(p.score * 100)
            const isBase = p.delta === null
            const nodeColor = isBase
              ? 'var(--accent)'
              : p.delta > 0 ? 'var(--score-high)' : p.delta < 0 ? 'var(--score-low)' : '#9ca3af'
            const deltaPct = p.delta !== null ? Math.round(p.delta * 100) : null

            return (
              <g key={i} className="pipeline-node" style={{ '--node-index': i }}>
                <title>{isBase ? `Score de base : ${pct}%` : `${p.fullLabel} (${formatShortDate(p.date)}) : ${pct}% (${deltaPct >= 0 ? '+' : ''}${deltaPct}%)`}</title>

                {/* Score label above node */}
                <text
                  x={cx.toFixed(1)} y={(cy - 18).toFixed(1)}
                  textAnchor="middle" fontSize="11" fontWeight="800"
                  fill={nodeColor}
                  fontFamily="var(--font-mono, monospace)"
                >{pct}%</text>

                {/* Node circle */}
                <circle
                  cx={cx.toFixed(1)} cy={cy.toFixed(1)}
                  r="12"
                  fill={nodeColor}
                  stroke="var(--surface)"
                  strokeWidth="3"
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                />

                {/* White inner dot */}
                <circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r="4" fill="white" />

                {/* Delta badge */}
                {!isBase && deltaPct !== null && deltaPct !== 0 && (
                  <g>
                    <rect
                      x={(cx - 18).toFixed(1)} y={(cy + 22).toFixed(1)}
                      width="36" height="14" rx="7"
                      fill={p.delta > 0 ? '#e6f4ea' : '#fce8e8'}
                    />
                    <text
                      x={cx.toFixed(1)} y={(cy + 32).toFixed(1)}
                      textAnchor="middle" fontSize="9" fontWeight="700"
                      fill={p.delta > 0 ? 'var(--score-high)' : 'var(--score-low)'}
                    >{deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
        </div>
      </div>
    </div>
  )
}

function ScoringTab({ hrflowScore, aiAdjustment, bonus, savedBonus, setBonus, onSaveBonus, bonusSaving, profileKey, jobKey, refreshKey }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Détail du score</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Score Initial', value: fmt(hrflowScore) },
            { label: 'Ajustement IA', value: fmtAdj(aiAdjustment) },
            { label: 'Bonus RH', value: savedBonus > 0 ? `+${savedBonus}%` : `${savedBonus}%` },
            { label: 'Total', value: fmt(totalScore), highlight: true },
          ].map((item, i) => (
            <div key={item.label} className="anim-item" style={{ padding: '14px', background: item.highlight ? '#e8f4fd' : 'var(--bg)', border: `1px solid ${item.highlight ? '#b3d9f5' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', textAlign: 'center', '--item-index': i }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: item.highlight ? 'var(--accent)' : 'var(--text)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="anim-item" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', '--item-index': 4 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>Ajustement du bonus RH</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Modifier manuellement le score du candidat. Valeur entre −100 et +100.</div>
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
            {bonusSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div className="anim-item" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginTop: 16, '--item-index': 5, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14, flexShrink: 0 }}>Évolution du score</div>
        <ScoreEvolutionGraph
          profileKey={profileKey}
          jobKey={jobKey}
          baseScore={hrflowScore}
          savedBonus={savedBonus}
          refreshKey={refreshKey}
        />
      </div>
    </div>
  )
}


function ResumeTab({ profile }) {
  const pdfUrl = profile?.attachments?.[0]?.public_url

  if (!pdfUrl) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
        Aucune pièce jointe PDF disponible pour ce profil.
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
      title="CV PDF"
    />
  )
}

function EmailTab({ job, candidateRef }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [emailData, setEmailData] = useState({ subject: '', body: '', to: candidateRef.email || '' })
  const [guidelines, setGuidelines] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await generateEmail(job.key, candidateRef.profile_key, guidelines)
      setEmailData({ ...emailData, subject: data.subject, body: data.body })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenMailClient = () => {
    if (!emailData.to || !emailData.subject || !emailData.body) return
    
    const subject = encodeURIComponent(emailData.subject)
    const body = encodeURIComponent(emailData.body)
    
    // Direct Gmail Compose URL - this is much more reliable for a "popup" feel
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${emailData.to}&su=${subject}&body=${body}`
    
    // Open in a real small popup window
    const width = 800
    const height = 700
    const left = (window.innerWidth / 2) - (width / 2)
    const top = (window.innerHeight / 2) - (height / 2)
    
    window.open(
      gmailUrl, 
      'GmailCompose', 
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
    )
  }

  return (
    <div className="anim-content">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Envoyer un e-mail au candidat</div>
        
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ marginBottom: 16, padding: '12px', background: '#f8f9fa', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>Consignes de génération</div>
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              style={{ width: '100%', minHeight: 60, padding: '8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '.8rem', background: '#fff', resize: 'vertical' }}
              placeholder="Ex: 'Invitation à un entretien', 'Refus poli', 'Suivi technique'..."
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>À :</div>
            <input
              type="text"
              value={emailData.to}
              onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '.875rem' }}
              placeholder="candidat@email.com"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Objet :</div>
            <input
              type="text"
              value={emailData.subject}
              onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '.875rem' }}
              placeholder="Objet de l'e-mail"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Message :</div>
            <textarea
              value={emailData.body}
              onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
              style={{ width: '100%', minHeight: 200, padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '.875rem', lineHeight: 1.5, resize: 'vertical' }}
              placeholder="Contenu de l'e-mail..."
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              className="btn-secondary" 
              onClick={handleGenerate} 
              disabled={loading}
              style={{ 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                // Petit effet de bordure dégradée pour le côté "IA"
                border: '1px solid #1264a3',
                position: 'relative',
                fontWeight: 600
              }}
            >
              {loading ? (
                <div className="spinner" style={{ width: 14, height: 14, border: '2px solid #666', borderTopColor: 'transparent' }} />
              ) : (
                <>
                  Générer avec l'IA
                </>
              )}
            </button>
            <button 
              className="btn-primary" 
              onClick={handleOpenMailClient} 
              disabled={loading || !emailData.subject || !emailData.body || !emailData.to}
              style={{ flex: 1 }}
            >
              Ouvrir dans le client de messagerie
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#ffebee', color: '#c62828', borderRadius: 'var(--radius)', fontSize: '.8rem', textAlign: 'center' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
