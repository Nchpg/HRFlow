import { useState, useEffect } from 'react'
import { getJobStages, createCustomStage, deleteCustomStage, updateJobStatus, getPresetStages, reorderCustomStages } from '../services/api'

const COLORS = ['teal', 'cyan', 'pink', 'amber', 'lime', 'sky', 'rose', 'violet']

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,.4)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: 'var(--surface)',
    width: 'min(500px, 90vw)',
    maxHeight: '90vh',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: '1rem', fontWeight: 600 },
  body: { padding: '20px', overflowY: 'auto', flex: 1 },
  footer: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 },
  section: { marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 24 },
  sectionTitle: { fontSize: '.85rem', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 },
  stageItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'var(--bg)',
    borderRadius: 'var(--radius)',
    marginBottom: 6,
    border: '1px solid var(--border)',
  },
  badge: (color) => ({
    width: 10, height: 10, borderRadius: '50%', background: color, marginRight: 10
  }),
  form: { marginTop: 10, padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#fafafa' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 12, fontSize: '.9rem' },
  colorGrid: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  colorCircle: (color, active) => ({
    width: 20, height: 20, borderRadius: '50%', background: color, cursor: 'pointer',
    border: active ? '2px solid var(--accent)' : '2px solid transparent',
    boxSizing: 'border-box'
  }),
  statusOption: (active) => ({
    flex: 1,
    padding: '10px 5px',
    textAlign: 'center',
    fontSize: '.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 'var(--radius)',
    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
    background: active ? '#f0f7ff' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    transition: 'all .15s',
    minWidth: 0,
  }),
  reorderBtn: (disabled) => ({
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '2px 6px',
    fontSize: '.75rem',
    color: 'var(--text-muted)',
    opacity: disabled ? 0.3 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  }),
  deleteBtn: (disabled) => ({
    background: 'none',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? 'var(--text-muted)' : '#ff5252',
    opacity: disabled ? 0.5 : 1,
    padding: '4px',
    marginLeft: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    transition: 'background .1s',
  })
}

export default function StageManager({ job, onClose, onStatusChange }) {
  const [stages, setStages] = useState([])
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('teal')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [jobStatus, setJobStatus] = useState(job?.status || 'open')
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deletingKeys, setDeletingKeys] = useState([])

  const fetchStages = async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [stagesData, presetsData] = await Promise.all([
        getJobStages(job.key),
        getPresetStages(job.key)
      ])
      setStages(stagesData.stages)
      setPresets(presetsData.presets)
    } catch (e) {
      console.error(e)
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    fetchStages()
  }, [job.key])

  const handleCreate = async (label, color) => {
    setSubmitting(true)
    setError(null)
    try {
      await createCustomStage(job.key, label, color)
      setNewLabel('')
      fetchStages(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (key) => {
    if (deletingKeys.includes(key)) return
    if (!window.confirm('Are you sure you want to delete this stage?')) return
    
    setDeletingKeys(prev => [...prev, key])
    try {
      const res = await deleteCustomStage(job.key, key)
      if (res.error === 'stage_in_use') {
        alert(res.message)
        setDeletingKeys(prev => prev.filter(k => k !== key))
      } else {
        await fetchStages(true)
        setDeletingKeys(prev => prev.filter(k => k !== key))
      }
    } catch (e) {
      alert(e.message)
      setDeletingKeys(prev => prev.filter(k => k !== key))
    }
  }

  const handleStatusUpdate = async (newStatus) => {
    if (newStatus === jobStatus) return
    setStatusUpdating(true)
    try {
      await updateJobStatus(job.key, newStatus)
      setJobStatus(newStatus)
      onStatusChange?.(newStatus)
    } catch (e) {
      alert(e.message)
    } finally {
      setStatusUpdating(false)
    }
  }

  const moveStage = async (index, direction) => {
    const newStages = [...stages]
    const targetIndex = index + direction
    
    if (targetIndex < 1 || targetIndex > stages.length - 3) return
    if (stages[index].builtin || stages[targetIndex].builtin) return

    const temp = newStages[index]
    newStages[index] = newStages[targetIndex]
    newStages[targetIndex] = temp
    setStages(newStages)

    try {
      const customOnly = newStages.filter(s => !s.builtin)
      await reorderCustomStages(job.key, customOnly.map(s => s.key))
    } catch (e) {
      alert(e.message)
      fetchStages(true)
    }
  }

  const getHexColor = (name) => {
    const colors = {
      gray: '#9e9e9e', blue: '#2196f3', indigo: '#3f51b5', purple: '#9c27b0',
      orange: '#ff9800', green: '#4caf50', red: '#f44336', teal: '#009688',
      cyan: '#00bcd4', pink: '#e91e63', amber: '#ffc107', lime: '#cddc39',
      sky: '#03a9f4', rose: '#f43f5e', violet: '#8b5cf6'
    }
    return colors[name] || '#9e9e9e'
  }

  const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
    </svg>
  )

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>Pipeline Settings — {job.name}</div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }} onClick={onClose}>✕</button>
        </div>
        
        <div style={s.body}>
          <div style={s.section}>
            <div style={s.sectionTitle}>
              Job Operational Status
              {statusUpdating && <div className="spinner" style={{ width: 12, height: 12, margin: 0 }} />}
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              {['open', 'on_hold', 'closed'].map(status => (
                <div 
                  key={status}
                  style={s.statusOption(jobStatus === status)} 
                  onClick={() => handleStatusUpdate(status)}
                >
                  {status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </div>
              ))}
            </div>
          </div>

          <div style={s.sectionTitle}>Recruitment Pipeline</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 15 }}>
            Customize the stages between <b>Applied</b> and <b>Hired</b>.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" /></div>
          ) : (
            <div>
              {stages.map((stage, i) => {
                const isCustom = !stage.builtin
                const canMoveUp = isCustom && i > 1 && !stages[i-1].builtin
                const canMoveDown = isCustom && i < stages.length - 3 && !stages[i+1].builtin
                
                return (
                  <div key={stage.key} style={s.stageItem}>
                    <div style={s.badge(getHexColor(stage.color))} />
                    <div style={{ flex: 1, fontSize: '.9rem', fontWeight: stage.builtin ? 600 : 400 }}>
                      {stage.label}
                      {stage.builtin && <span style={{ marginLeft: 8, fontSize: '.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Locked</span>}
                    </div>
                    
                    {isCustom && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button 
                          style={s.reorderBtn(!canMoveUp)} 
                          onClick={() => canMoveUp && moveStage(i, -1)} 
                          title="Move up"
                          disabled={!canMoveUp}
                        >↑</button>
                        <button 
                          style={s.reorderBtn(!canMoveDown)} 
                          onClick={() => canMoveDown && moveStage(i, 1)} 
                          title="Move down"
                          disabled={!canMoveDown}
                        >↓</button>
                        <button 
                          style={s.deleteBtn(deletingKeys.includes(stage.key))}
                          onClick={() => handleDelete(stage.key)}
                          title="Delete stage"
                          disabled={deletingKeys.includes(stage.key)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {presets.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Quick Add Presets</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {presets.filter(p => !stages.some(s => s.key === p.key)).map(p => (
                      <button 
                        key={p.key} 
                        className="btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: '.75rem' }}
                        onClick={() => handleCreate(p.label, p.color)}
                        disabled={submitting}
                      >
                        + {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form style={s.form} onSubmit={(e) => { e.preventDefault(); handleCreate(newLabel, newColor); }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: 10 }}>Add New Stage</div>
                <input 
                  style={s.input} 
                  placeholder="Stage Name..." 
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  maxLength={40}
                />
                <div style={s.colorGrid}>
                  {COLORS.map(c => (
                    <div 
                      key={c} 
                      style={s.colorCircle(getHexColor(c), newColor === c)} 
                      onClick={() => setNewColor(c)}
                      title={c}
                    />
                  ))}
                </div>
                {error && <div style={{ color: 'red', fontSize: '.8rem', marginBottom: 10 }}>{error}</div>}
                <button 
                  className="btn-primary" 
                  style={{ width: '100%' }} 
                  disabled={submitting || !newLabel.trim()}
                >
                  {submitting ? 'Adding...' : 'Add Stage'}
                </button>
              </form>
            </div>
          )}
        </div>

        <div style={s.footer}>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
