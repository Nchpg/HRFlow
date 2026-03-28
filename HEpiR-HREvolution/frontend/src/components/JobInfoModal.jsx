import React from 'react'

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
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' },
  text: { fontSize: '.9375rem', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' },
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

function _skill_name(s) {
  return s?.name || (typeof s === 'string' ? s : '')
}

export default function JobInfoModal({ job, onClose }) {
  if (!job) return null

  const skills = job.skills || []
  const location = job.location?.text || job.location || ''

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>{job.name || 'Job Details'}</div>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>

        <div style={s.body}>
          {location && (
            <div style={s.section}>
              <div style={s.label}>Location</div>
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
              <div style={s.label}>Requirements</div>
              <div style={s.chipRow}>
                {skills.map((sk, i) => (
                  <span key={i} style={s.chip(sk.value)}>
                    {_skill_name(sk)}
                    {sk.value && <span style={s.level}>{sk.value}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {!job.summary && !skills.length && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>
              No detailed information available for this job.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
