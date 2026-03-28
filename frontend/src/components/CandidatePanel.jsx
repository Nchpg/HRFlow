import { useState, useEffect } from 'react'
import { getCandidate, synthesizeCandidate, getStoredSynthesis, updateBonus } from '../services/api'
import AskAssistant from './AskAssistant'

function scoreBadgeClass(score) {
  if (score === null || score === undefined) return 'none'
  if (score >= 0.7) return 'high'
  if (score >= 0.45) return 'mid'
  return 'low'
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
  actionRow: {
    display: 'flex',
    gap: 8,
    padding: '14px 20px',
    borderTop: '1px solid var(--border)',
    background: 'var(--surface)',
  },
}

const PIPELINE_STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired']

export default function CandidatePanel({ candidateRef, job, onClose }) {
  const [profile, setProfile] = useState(null)
  const [synthesis, setSynthesis] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingSynth, setLoadingSynth] = useState(false)
  const [bonus, setBonus] = useState(candidateRef?.bonus || 0)
  const [bonusSaving, setBonusSaving] = useState(false)
  const [showAsk, setShowAsk] = useState(false)

  useEffect(() => {
    if (!candidateRef || !job) return
    setLoadingProfile(true)
    setLoadingSynth(true)
    setProfile(null)
    setSynthesis(null)
    setBonus(candidateRef.bonus || 0)
    getCandidate(candidateRef.profile_key)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoadingProfile(false))
    getStoredSynthesis(job.key, candidateRef.profile_key)
      .then(async (data) => {
        if (data) {
          setSynthesis(data)
        } else {
          // No stored synthesis yet — generate and persist it now
          const generated = await synthesizeCandidate(job.key, candidateRef.profile_key)
          if (generated) setSynthesis(generated)
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSynth(false))
  }, [candidateRef, job])

  const handleSynthesize = async () => {
    if (!job || !candidateRef || loadingSynth) return
    setLoadingSynth(true)
    try {
      const data = await synthesizeCandidate(job.key, candidateRef.profile_key)
      setSynthesis(data)
      setActiveTab('synthesis')
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingSynth(false)
    }
  }

  const handleBonusSave = async () => {
    if (!job || !candidateRef) return
    setBonusSaving(true)
    try {
      await updateBonus(candidateRef.profile_key, job.key, parseFloat(bonus) || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setBonusSaving(false)
    }
  }

  if (!candidateRef) return null

  const info = profile?.info || {}
  const pictureUrl = info.picture || null
  const initials = `${candidateRef.first_name?.[0] || ''}${candidateRef.last_name?.[0] || ''}`.toUpperCase() || '?'
  const fullName = `${candidateRef.first_name} ${candidateRef.last_name}`.trim()
  const totalScore = candidateRef.score !== null && candidateRef.score !== undefined
    ? Math.min(1, (candidateRef.score || 0) + (candidateRef.bonus || 0))
    : null

  const currentStageIdx = PIPELINE_STAGES.findIndex(
    (st) => st.toLowerCase() === (candidateRef.stage || '').toLowerCase()
  )

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
                {synthesis?.verdict && (
                  <span className={`verdict ${synthesis.verdict}`}>{synthesis.verdict.replace('_', ' ')}</span>
                )}
              </div>
            </div>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>

          {/* Pipeline progress */}
          <PipelineProgress stages={PIPELINE_STAGES} currentIdx={currentStageIdx} />

          {/* Tabs */}
          <div style={s.tabs}>
            {['overview', 'synthesis', 'scoring', 'resume'].map((tab) => (
              <div key={tab} style={s.tab(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ ...s.body, overflow: activeTab === 'resume' ? 'hidden' : 'auto', padding: activeTab === 'resume' ? 0 : '20px' }}>
            {loadingProfile ? (
              <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab profile={profile} candidateRef={candidateRef} />
                )}
                {activeTab === 'synthesis' && (
                  <SynthesisTab synthesis={synthesis} loading={loadingSynth} />
                )}
                {activeTab === 'scoring' && (
                  <ScoringTab
                    candidateRef={candidateRef}
                    bonus={bonus}
                    setBonus={setBonus}
                    onSaveBonus={handleBonusSave}
                    bonusSaving={bonusSaving}
                  />
                )}
                {activeTab === 'resume' && (
                  <ResumeTab profile={profile} />
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div style={s.actionRow}>
            <button className="btn-primary" onClick={handleSynthesize} disabled={loadingSynth}>
              {loadingSynth ? '⏳ Generating…' : synthesis ? '🔄 Re-generate' : '📄 Synthesize'}
            </button>
            <button className="btn-ghost" onClick={() => setShowAsk(true)}>
              💬 Ask
            </button>
          </div>
        </div>
      </div>

      {showAsk && job && (
        <AskAssistant
          job={job}
          candidateRef={candidateRef}
          onClose={() => setShowAsk(false)}
        />
      )}
    </>
  )
}

function PipelineProgress({ stages, currentIdx }) {
  return (
    <div style={{ display: 'flex', padding: '10px 20px', gap: 0, background: '#fafafa', borderBottom: '1px solid var(--border)' }}>
      {stages.map((stage, i) => {
        const done = i <= currentIdx
        const active = i === currentIdx
        return (
          <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i < stages.length - 1 && (
              <div style={{
                position: 'absolute', top: 9, left: '50%', width: '100%',
                height: 2, background: done ? 'var(--accent)' : 'var(--border)',
                zIndex: 0,
              }} />
            )}
            <div style={{
              width: 20, height: 20, borderRadius: '50%', zIndex: 1,
              background: done ? 'var(--accent)' : 'var(--border)',
              border: active ? '2px solid var(--accent)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {done && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
            </div>
            <div style={{ fontSize: '.65rem', color: done ? 'var(--accent)' : 'var(--text-muted)', marginTop: 4, fontWeight: active ? 600 : 400 }}>
              {stage}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverviewTab({ profile, candidateRef }) {
  const info = profile?.info || {}
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
      Click <strong>Synthesize</strong> to generate an AI summary for this candidate.
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
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function ScoringTab({ candidateRef, bonus, setBonus, onSaveBonus, bonusSaving }) {
  const base = candidateRef.score
  const totalScore = base !== null && base !== undefined
    ? Math.min(1, (base || 0) + (parseFloat(bonus) || 0))
    : null

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Score breakdown</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Base score', value: base !== null && base !== undefined ? `${Math.round((base) * 100)}%` : '—' },
            { label: 'Bonus', value: `+${Math.round((parseFloat(bonus) || 0) * 100)}%` },
            { label: 'Total', value: totalScore !== null ? `${Math.round(totalScore * 100)}%` : '—', highlight: true },
          ].map((item) => (
            <div key={item.label} style={{ padding: '14px', background: item.highlight ? '#e8f4fd' : 'var(--bg)', border: `1px solid ${item.highlight ? '#b3d9f5' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: item.highlight ? 'var(--accent)' : 'var(--text)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>HR Bonus adjustment</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number"
            min="-1" max="1" step="0.01"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            style={{ width: 90, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 10px', fontSize: '.875rem', outline: 'none' }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>value between -1.0 and +1.0</span>
          <button className="btn-primary" onClick={onSaveBonus} disabled={bonusSaving}>
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
