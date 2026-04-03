import { useState } from 'react'

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
    zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    width: 'min(600px, 95vw)',
    maxHeight: '85vh',
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
  title: { flex: 1, fontWeight: 700, fontSize: '1.0625rem' },
  close: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' },
  body: { padding: '24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 },
  section: {
    display: 'flex', flexDirection: 'column', gap: 10,
    borderLeft: '3px solid var(--accent)',
    paddingLeft: 14,
  },
  label: {
    fontSize: '.8rem', fontWeight: 700, color: 'var(--text)',
    textTransform: 'uppercase', letterSpacing: '.07em',
  },
  text: { fontSize: '.9rem', lineHeight: 1.7, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: (level) => ({
    fontSize: '.8rem',
    padding: '.25rem .75rem',
    borderRadius: 99,
    background: (LEVEL_COLORS[level] || { bg: '#f5f5f5' }).bg,
    color: (LEVEL_COLORS[level] || { color: '#666' }).color,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }),
  level: { fontSize: '.65rem', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase' },
}

const SKILL_LEVELS = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
  expert: 'Expert',
}

function _skill_name(s) {
  return s?.name || (typeof s === 'string' ? s : '')
}

export default function JobInfoModal({ job, onClose }) {
  const [closing, setClosing] = useState(false)

  function handleClose() {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 220)
  }

  if (!job) return null

  const skills = job.skills || []
  const location = job.location?.text || job.location || ''

  return (
    <div style={s.overlay} className={closing ? 'anim-overlay-exit' : 'anim-overlay'} onClick={handleClose}>
      <div style={s.modal} className={closing ? 'anim-modal-exit' : 'anim-modal'} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>{job.name || 'Détails du poste'}</div>
          <button style={s.close} onClick={handleClose}>✕</button>
        </div>

        <div style={s.body}>
          {location && (
            <div style={s.section}>
              <div style={s.label}>Emplacement</div>
              <div style={s.text}>{location}</div>
            </div>
          )}

          {job.summary && (
            <div style={s.section}>
              <div style={s.label}>Description</div>
              <div style={s.text}>{job.summary}</div>
            </div>
          )}

          {skills.length > 0 && (
            <div style={s.section}>
              <div style={s.label}>Exigences</div>
              <div style={s.chipRow}>
                {skills.map((sk, i) => (
                  <span key={i} style={s.chip(sk.value)}>
                    {_skill_name(sk)}
                    {sk.value && <span style={s.level}>{SKILL_LEVELS[sk.value] || sk.value}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {!job.summary && !skills.length && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>
              Aucune information détaillée disponible pour ce poste.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
