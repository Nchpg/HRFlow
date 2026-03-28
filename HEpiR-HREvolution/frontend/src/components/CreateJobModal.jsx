import { useState, useRef } from 'react'
import { createJob } from '../services/api'
import { registerPendingJob } from '../pages/DashboardPage'

const LEVELS = [
  { label: 'Beginner',     value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced',     value: 'advanced' },
  { label: 'Expert',       value: 'expert' },
]

const LEVEL_COLORS = {
  beginner:     { bg: '#e8f5e9', color: '#2e7d32' },
  intermediate: { bg: '#e3f2fd', color: '#1565c0' },
  advanced:     { bg: '#fff3e0', color: '#e65100' },
  expert:       { bg: '#fce4ec', color: '#c62828' },
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,.5)',
    zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    width: 'min(540px, 95vw)',
    maxHeight: '90vh',
    boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: { flex: 1, fontWeight: 700, fontSize: '1rem' },
  close: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' },
  input: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px 10px',
    fontSize: '.875rem',
    outline: 'none',
    fontFamily: 'inherit',
    color: 'var(--text)',
    background: 'var(--bg)',
  },
  textarea: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px 10px',
    fontSize: '.875rem',
    outline: 'none',
    fontFamily: 'inherit',
    color: 'var(--text)',
    background: 'var(--bg)',
    resize: 'vertical',
    minHeight: 90,
  },
  // Skills token area
  skillsBox: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  tokenList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  token: (level) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px 4px 10px',
    borderRadius: 99,
    background: (LEVEL_COLORS[level] || LEVEL_COLORS.intermediate).bg,
    color: (LEVEL_COLORS[level] || LEVEL_COLORS.intermediate).color,
    fontSize: '.8rem',
    fontWeight: 500,
    lineHeight: 1,
  }),
  tokenLevel: {
    fontSize: '.68rem',
    fontWeight: 600,
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: '.03em',
  },
  tokenRemove: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0 0 0 2px',
    fontSize: 13,
    lineHeight: 1,
    color: 'inherit',
    opacity: 0.6,
    display: 'flex',
    alignItems: 'center',
  },
  addRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    borderTop: '1px solid var(--border)',
    paddingTop: 8,
  },
  addInput: {
    flex: 1,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '6px 10px',
    fontSize: '.8125rem',
    outline: 'none',
    fontFamily: 'inherit',
    color: 'var(--text)',
    background: 'var(--surface)',
  },
  levelSelect: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '6px 8px',
    fontSize: '.8125rem',
    outline: 'none',
    fontFamily: 'inherit',
    color: 'var(--text)',
    background: 'var(--surface)',
    cursor: 'pointer',
  },
  addBtn: {
    padding: '6px 14px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: '14px 20px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  success: {
    padding: '10px 14px',
    background: '#d4edda',
    borderRadius: 'var(--radius)',
    color: '#155724',
    fontSize: '.875rem',
  },
  error: {
    padding: '10px 14px',
    background: '#f8d7da',
    borderRadius: 'var(--radius)',
    color: '#721c24',
    fontSize: '.875rem',
  },
}

const EMPTY_FORM = { name: '', summary: '', location: '' }

export default function CreateJobModal({ onClose, onSuccess }) {
  const [form, setForm]     = useState(EMPTY_FORM)
  const [skills, setSkills] = useState([])
  const [newSkill, setNewSkill] = useState({ name: '', level: 'intermediate' })
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const skillInputRef = useRef()

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function addSkill() {
    const name = newSkill.name.trim()
    if (!name) return
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setNewSkill((s) => ({ ...s, name: '' }))
      return
    }
    setSkills((prev) => [...prev, { name, level: newSkill.level }])
    setNewSkill((s) => ({ ...s, name: '' }))
    skillInputRef.current?.focus()
  }

  function removeSkill(idx) {
    setSkills((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSkillKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addSkill() }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await createJob({
        name: form.name.trim(),
        summary: form.summary.trim(),
        location: form.location.trim(),
        skills: skills.map((s) => ({ name: s.name, value: s.level })),
      })
      if (data.job_key) registerPendingJob(data.job_key)
      setResult(data)
      onSuccess?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        <div style={s.header}>
          <div style={s.title}>Create a job</div>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div style={s.body}>
            {result && <div style={s.success}>✓ Job created — <strong>{result.name || result.job_key}</strong></div>}
            {error  && <div style={s.error}>⚠ {error}</div>}

            <div style={s.field}>
              <label style={s.label}>Job title *</label>
              <input style={s.input} placeholder="e.g. Senior Frontend Engineer"
                value={form.name} onChange={setField('name')} required autoFocus />
            </div>

            <div style={s.field}>
              <label style={s.label}>Location</label>
              <input style={s.input} placeholder="e.g. Paris, France (or Remote)"
                value={form.location} onChange={setField('location')} />
            </div>

            <div style={s.field}>
              <label style={s.label}>Description</label>
              <textarea style={s.textarea} placeholder="Role summary, responsibilities, requirements…"
                value={form.summary} onChange={setField('summary')} />
            </div>

            <div style={s.field}>
              <label style={s.label}>Skills{skills.length > 0 && ` (${skills.length})`}</label>
              <div style={s.skillsBox}>
                {/* Token list */}
                {skills.length > 0 && (
                  <div style={s.tokenList}>
                    {skills.map((skill, i) => (
                      <span key={i} style={s.token(skill.level)}>
                        {skill.name}
                        <span style={s.tokenLevel}>{skill.level}</span>
                        <button
                          type="button"
                          style={s.tokenRemove}
                          onClick={() => removeSkill(i)}
                          title="Remove"
                        >✕</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add row */}
                <div style={skills.length > 0 ? s.addRow : { display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    ref={skillInputRef}
                    style={s.addInput}
                    placeholder="Skill name…"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill((s) => ({ ...s, name: e.target.value }))}
                    onKeyDown={handleSkillKeyDown}
                  />
                  <select
                    style={s.levelSelect}
                    value={newSkill.level}
                    onChange={(e) => setNewSkill((s) => ({ ...s, level: e.target.value }))}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                  <button type="button" style={s.addBtn} onClick={addSkill}>
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={s.footer}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary"
              disabled={!form.name.trim() || loading || !!result}>
              {loading ? '⏳ Creating…' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
