import { useState, useEffect, useRef } from 'react'
import { getExtraDocuments, uploadExtraDocument, uploadExtraDocumentFile, gradeCandidate } from '../services/api'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function preview(content) {
  const lines = (content || '').split('\n').slice(0, 2).join(' ')
  return lines.length > 120 ? lines.slice(0, 120) + '…' : lines || '(empty)'
}

// ---------------------------------------------------------------------------
// Text viewer panel (full content overlay)
// ---------------------------------------------------------------------------

function TextViewerPanel({ doc, onClose }) {
  return (
    <div style={sv.overlay} onClick={onClose}>
      <div style={sv.panel} onClick={(e) => e.stopPropagation()}>
        <div style={sv.header}>
          <div style={sv.headerLeft}>
            <span style={{ fontSize: '1.1rem' }}>📄</span>
            <div>
              <div style={sv.filename}>{doc.filename}</div>
              <div style={sv.meta}>{doc.uploaded_by}{doc.uploaded_by ? ' · ' : ''}{formatDate(doc.uploaded_at)}</div>
            </div>
          </div>
          <button style={sv.closeBtn} onClick={onClose}>✕</button>
        </div>
        <pre style={sv.body}>{doc.content}</pre>
      </div>
    </div>
  )
}

const sv = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,.45)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    width: 'min(640px, 92vw)',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    gap: 10,
  },
  headerLeft: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  filename: { fontWeight: 600, fontSize: '.9375rem', color: 'var(--text)' },
  meta: { fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 },
  closeBtn: {
    background: 'transparent', border: 'none',
    fontSize: 18, cursor: 'pointer',
    color: 'var(--text-muted)', padding: 2, lineHeight: 1,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '18px 20px',
    margin: 0,
    fontFamily: 'monospace',
    fontSize: '.8125rem',
    lineHeight: 1.65,
    color: 'var(--text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
}

// ---------------------------------------------------------------------------
// Document bubble (chat message)
// ---------------------------------------------------------------------------

function DeltaBadge({ delta }) {
  if (delta === undefined || delta === null) return null
  const pct = Math.round(delta * 100)
  const label = pct > 0 ? `+${pct}%` : `${pct}%`
  const bg = delta > 0 ? '#2bac76' : delta < 0 ? '#e01e5a' : 'rgba(255,255,255,.25)'
  return (
    <span style={{
      fontSize: '.75rem', fontWeight: 700, padding: '2px 8px',
      borderRadius: 99, background: 'rgba(255,255,255,.18)', color: '#fff', flexShrink: 0,
      letterSpacing: '.03em', border: `1.5px solid ${bg}`,
    }}>
      {label}
    </span>
  )
}

function DocumentBubble({ doc, onView }) {
  return (
    <div style={sb.wrapper}>
      <div style={sb.bubble}>
        <div style={sb.topRow}>
          <span style={{ fontSize: '.9rem' }}>📄</span>
          <span style={sb.filename}>{doc.filename}</span>
          <DeltaBadge delta={doc.delta} />
        </div>
        {doc.delta_rationale && (
          <div style={sb.rationale}>
            <span style={sb.rationaleIcon}>✦</span>
            {doc.delta_rationale}
          </div>
        )}
        <div style={sb.divider} />
        <div style={sb.preview}>{preview(doc.content)}</div>
        <button style={sb.viewBtn} onClick={() => onView(doc)}>
          View full text ›
        </button>
        <div style={sb.footer}>
          {doc.uploaded_by && <span>{doc.uploaded_by} · </span>}
          {formatDate(doc.uploaded_at)}
        </div>
      </div>
    </div>
  )
}

const sb = {
  wrapper: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  bubble: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '14px 14px 2px 14px',
    padding: '10px 14px',
    maxWidth: 320,
    minWidth: 180,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  filename: {
    fontWeight: 600,
    fontSize: '.875rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  rationale: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 5,
    fontSize: '.75rem',
    fontStyle: 'italic',
    background: 'rgba(255,255,255,.15)',
    borderLeft: '2px solid rgba(255,255,255,.6)',
    borderRadius: '0 4px 4px 0',
    padding: '5px 8px',
    marginBottom: 8,
    lineHeight: 1.45,
  },
  rationaleIcon: {
    flexShrink: 0,
    fontSize: '.65rem',
    marginTop: 1,
    opacity: 0.8,
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,.3)',
    marginBottom: 8,
  },
  preview: {
    fontSize: '.8125rem',
    lineHeight: 1.5,
    opacity: 0.92,
    marginBottom: 8,
    wordBreak: 'break-word',
  },
  viewBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,.6)',
    borderRadius: 6,
    color: '#fff',
    fontSize: '.75rem',
    padding: '3px 8px',
    cursor: 'pointer',
    marginBottom: 8,
    display: 'block',
    width: '100%',
    textAlign: 'center',
  },
  footer: {
    fontSize: '.7rem',
    opacity: 0.7,
    textAlign: 'right',
  },
}

// ---------------------------------------------------------------------------
// Document input (composer)
// ---------------------------------------------------------------------------

function DocumentInput({ onSend, onUploadFile }) {
  const [filename, setFilename] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const handleSend = async () => {
    if (!content.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(filename.trim(), content.trim())
      setFilename('')
      setContent('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file || sending) return
    setSending(true)
    setError(null)
    try {
      await onUploadFile(file)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend()
  }

  return (
    <div style={si.root}>
      <input
        style={si.filenameInput}
        placeholder="Filename (optional, e.g. interview_notes)"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        disabled={sending}
      />
      <textarea
        style={si.textarea}
        placeholder="Type or paste text content… (Ctrl+Enter to send)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKey}
        disabled={sending}
        rows={6}
      />
      {error && <div style={si.error}>{error}</div>}
      <div style={si.footer}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept=".pdf,.docx,.doc,.mp3,.m4a,.wav,.txt"
          />
          <button
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            title="Upload audio (mp3, m4a), text (pdf, docx, txt)"
          >
            📎 {sending ? '...' : 'Upload File'}
          </button>
          <span style={si.hint}>Ctrl+Enter to send</span>
        </div>
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={sending || !content.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

const si = {
  root: {
    borderTop: '1px solid var(--border)',
    padding: '14px 16px',
    background: 'var(--surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  filenameInput: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '6px 10px',
    fontSize: '.8125rem',
    outline: 'none',
    color: 'var(--text)',
    background: 'var(--bg)',
  },
  textarea: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '8px 10px',
    fontSize: '.8125rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    color: 'var(--text)',
    background: 'var(--bg)',
  },
  error: {
    fontSize: '.8rem',
    color: '#c0392b',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: {
    fontSize: '.75rem',
    color: 'var(--text-muted)',
  },
}

// ---------------------------------------------------------------------------
// Main DocumentsTab
// ---------------------------------------------------------------------------

export default function DocumentsTab({ profileKey, jobKey, onGraded, onProcessingChange }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingDoc, setViewingDoc] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    getExtraDocuments(profileKey, jobKey)
      .then((data) => setDocuments(data.documents || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [profileKey, jobKey])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [documents])

  const handleSend = async (filename, content) => {
    const result = await uploadExtraDocument(profileKey, jobKey, filename, content)
    // Optimistically append — don't wait for HRFlow indexing
    const optimistic = {
      id: result.id || `_opt_${Date.now()}`,
      filename: filename.trim() || 'document',
      content,
      uploaded_at: new Date().toISOString(),
      delta: null,
      delta_rationale: null,
    }
    setDocuments((prev) => [...prev, optimistic])
    // Auto re-grade then synthesize — onGraded owns the full chain and clears processing
    onProcessingChange?.(profileKey, 'Grading…')
    try {
      const gradeResult = await gradeCandidate(jobKey, profileKey)
      await onGraded?.(gradeResult)  // awaited: score update → synthesis → processing cleared
    } catch (e) {
      console.error('auto-grade failed:', e)
      onProcessingChange?.(profileKey, null)
    }
    // Re-fetch after grading to pick up delta / delta_rationale
    getExtraDocuments(profileKey, jobKey)
      .then((data) => setDocuments(data.documents || []))
      .catch(console.error)
  }

  const handleFileUpload = async (file) => {
    onProcessingChange?.(profileKey, 'Processing file…')
    try {
      const uploaded = await uploadExtraDocumentFile(profileKey, jobKey, file)
      // Optimistically append extracted content immediately
      const optimistic = {
        id: uploaded.id || `_opt_${Date.now()}`,
        filename: file.name,
        content: uploaded.content || '',
        uploaded_at: new Date().toISOString(),
        delta: null,
        delta_rationale: null,
      }
      setDocuments((prev) => [...prev, optimistic])
      
      onProcessingChange?.(profileKey, 'Grading…')
      const result = await gradeCandidate(jobKey, profileKey)
      await onGraded?.(result)
      // Re-fetch after grading to pick up delta / delta_rationale
      getExtraDocuments(profileKey, jobKey)
        .then((data) => setDocuments(data.documents || []))
        .catch(console.error)
    } catch (e) {
      console.error('file upload/processing failed:', e)
      onProcessingChange?.(profileKey, null)
      throw e
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={listRef} style={sd.list}>
        {loading ? (
          <div style={sd.empty}><div className="spinner" /></div>
        ) : documents.length === 0 ? (
          <div style={sd.empty}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>No documents yet</div>
            <div style={{ fontSize: '.8rem' }}>Send supplementary text to enrich the AI grading.</div>
          </div>
        ) : (
          documents.map((doc) => (
            <DocumentBubble key={doc.id} doc={doc} onView={setViewingDoc} />
          ))
        )}
      </div>

      <DocumentInput onSend={handleSend} onUploadFile={handleFileUpload} />

      {viewingDoc && (
        <TextViewerPanel doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </div>
  )
}

const sd = {
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '40px 20px',
  },
}
