import { useState } from 'react'
import CreateJobModal from './CreateJobModal'

const s = {
  sidebar: {
    width: 260,
    minWidth: 260,
    background: 'var(--sidebar-bg)',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--sidebar-border)',
    userSelect: 'none',
  },
  header: {
    padding: '20px 18px 14px',
    borderBottom: '1px solid var(--sidebar-border)',
  },
  brand: {
    color: '#fff',
    fontWeight: 700,
    fontSize: '1.4rem',
    letterSpacing: '-.02em',
  },
  sub: {
    color: 'var(--sidebar-muted)',
    fontSize: '.75rem',
    marginTop: 2,
  },
  search: {
    margin: '10px 10px 6px',
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    background: 'var(--sidebar-hover)',
    border: '1px solid var(--sidebar-border)',
    borderRadius: 'var(--radius)',
    padding: '6px 8px 6px 28px',
    color: 'var(--sidebar-text)',
    fontSize: '.8rem',
    outline: 'none',
  },
  searchIcon: {
    position: 'absolute',
    left: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--sidebar-muted)',
    fontSize: 13,
    pointerEvents: 'none',
  },
  sectionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px 4px',
  },
  sectionLabel: {
    color: 'var(--sidebar-muted)',
    fontSize: '.68rem',
    fontWeight: 600,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
  },
  addBtn: (color) => ({
    background: 'transparent',
    border: 'none',
    color: color || 'var(--sidebar-muted)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
    borderRadius: 3,
  }),
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 6px 12px',
  },
  item: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    background: active ? 'var(--sidebar-active)' : 'transparent',
    color: active ? '#fff' : 'var(--sidebar-text)',
    marginBottom: 2,
    transition: 'background .1s',
    fontSize: '.9375rem',
  }),
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--sidebar-muted)',
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: 'var(--sidebar-border)',
    margin: '8px 10px',
  },
  actionItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '9px 10px',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: '.875rem',
    fontWeight: 600,
    marginBottom: 1,
    transition: 'background .1s',
  },
  footer: {
    padding: '14px 18px',
    borderTop: '1px solid var(--sidebar-border)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--sidebar-text)',
    fontSize: '.8rem',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'var(--sidebar-active)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '.75rem',
    fontWeight: 700,
    flexShrink: 0,
  },
}

export default function Sidebar({ jobs, selectedJobKey, onSelectJob, loading, onDataChanged }) {
  const [search, setSearch] = useState('')
  const [showCreateJob, setShowCreateJob] = useState(false)

  const filtered = jobs.filter((j) =>
    j.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <aside style={s.sidebar}>
        <div style={s.header}>
          <div style={s.brand} className="anim-brand">HRévolution</div>
        </div>

        <div style={s.search}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            placeholder="Rechercher des postes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Jobs section */}
        <div style={s.sectionRow}>
          <span style={s.sectionLabel} className="anim-section-label">Postes</span>
        </div>

        <div style={s.list}>
          {loading && <div style={{ color: 'var(--sidebar-muted)', fontSize: '.8rem', padding: '6px 10px' }}>Chargement…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: 'var(--sidebar-muted)', fontSize: '.8rem', padding: '6px 10px' }}>Aucun poste trouvé</div>
          )}
          {filtered.map((job) => {
            const statusColors = {
              open: '#2bac76',
              on_hold: '#e8a838',
              closed: '#e01e5a',
            }
            return (
              <div
                key={job.key}
                style={s.item(job.key === selectedJobKey)}
                onClick={() => onSelectJob(job)}
                onMouseEnter={(e) => {
                  if (job.key !== selectedJobKey) e.currentTarget.style.background = 'var(--sidebar-hover)'
                }}
                onMouseLeave={(e) => {
                  if (job.key !== selectedJobKey) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ ...s.dot, background: statusColors[job.status] || 'var(--sidebar-muted)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.name || job.key}
                </span>
              </div>
            )
          })}
        </div>

        {/* Divider + create job action */}
        <div style={s.divider} />

        <div style={{ padding: '0 6px 10px' }}>
          <div
            style={s.actionItem}
            onClick={() => setShowCreateJob(true)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <span>+ Nouveau poste</span>
          </div>
        </div>

        <div style={s.footer}>
          <div style={s.avatar}>RH</div>
          <span>Responsable RH</span>
        </div>
      </aside>

      {showCreateJob && (
        <CreateJobModal
          onClose={() => setShowCreateJob(false)}
          onSuccess={() => { onDataChanged?.(); setShowCreateJob(false); }}
        />
      )}
    </>
  )
}
