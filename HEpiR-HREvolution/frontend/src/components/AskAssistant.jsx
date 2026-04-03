import { useState, useEffect } from 'react'
import { askQuestions } from '../services/api'

const CATEGORY_COLOR = {
  Technique: '#e8eaf6',
  Comportemental: '#fce4ec',
  Motivation: '#e8f5e9',
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,.5)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    width: 'min(560px, 95vw)',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-md)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    gap: 10,
  },
  title: { flex: 1, fontWeight: 700, fontSize: '1rem' },
  close: {
    background: 'transparent', border: 'none',
    fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  },
  question: {
    padding: '10px 14px',
    borderRadius: 'var(--radius)',
    marginBottom: 10,
    lineHeight: 1.55,
    fontSize: '.875rem',
  },
  categoryBadge: (cat) => ({
    display: 'inline-block',
    fontSize: '.68rem',
    fontWeight: 600,
    padding: '.1rem .5rem',
    borderRadius: 99,
    background: CATEGORY_COLOR[cat] || '#f5f5f5',
    color: '#444',
    marginBottom: 4,
  }),
}

const CATEGORY_ORDER = ['Technique', 'Comportemental', 'Motivation']

const CATEGORY_MAP = {
  'Technical': 'Technique',
  'Behavioral': 'Comportemental',
  'Motivation': 'Motivation'
}

export default function AskAssistant({ job, candidateRef, onClose, inline = false }) {
  const [closing, setClosing] = useState(false)

  function handleClose() {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 220)
  }

  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)

    askQuestions(job.key, candidateRef.profile_key)
      .then((data) => {
        if (!ignore) {
          const mapped = (data.questions || []).map(q => ({
            ...q,
            category: CATEGORY_MAP[q.category] || q.category
          }))
          const sorted = mapped.sort((a, b) => {
            const idxA = CATEGORY_ORDER.indexOf(a.category)
            const idxB = CATEGORY_ORDER.indexOf(b.category)
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
          })
          setQuestions(sorted)
        }
      })
      .catch((e) => {
        if (!ignore) setError(e.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [job.key, candidateRef.profile_key])

  const questionList = (
    <>
      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" />
          <div style={{ marginTop: 10, fontSize: '.8rem', color: 'var(--text-muted)' }}>Génération de questions personnalisées...</div>
        </div>
      )}
      {error && <div style={{ color: 'var(--score-low)', padding: 20 }}>Erreur : {error}</div>}
      {!loading && !error && (
        <>
          {questions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>Aucune question générée.</div>
          ) : (
            questions.map((q, i) => (
              <div key={i} className="anim-item" style={{ ...s.question, background: CATEGORY_COLOR[q.category] || '#f5f5f5', '--item-index': i }}>
                <div style={s.categoryBadge(q.category)}>{q.category}</div>
                <div>{q.question}</div>
              </div>
            ))
          )}
        </>
      )}
    </>
  )

  if (inline) return questionList

  const candidateName = `${candidateRef.first_name} ${candidateRef.last_name}`.trim()

  return (
    <div style={s.overlay} className={closing ? 'anim-overlay-exit' : 'anim-overlay'} onClick={handleClose}>
      <div style={s.modal} className={closing ? 'anim-modal-exit' : 'anim-modal'} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={{ fontSize: 20 }}>💬</span>
          <div style={s.title}>Questions d'entretien — {candidateName}</div>
          <button style={s.close} onClick={handleClose}>✕</button>
        </div>

        <div style={s.body}>{questionList}</div>
      </div>
    </div>
  )
}
