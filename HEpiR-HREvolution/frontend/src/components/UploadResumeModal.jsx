import { useState, useRef } from 'react'
import { uploadResume } from '../services/api'

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
    width: 'min(460px, 95vw)',
    boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
  },
  title: { flex: 1, fontWeight: 700, fontSize: '1rem' },
  close: { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' },
  body: { padding: '20px' },
  dropzone: (dragging) => ({
    border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-lg)',
    padding: '36px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    background: dragging ? '#f0f4ff' : 'var(--bg)',
    transition: 'border-color .15s, background .15s',
  }),
  fileIcon: { fontSize: 32, marginBottom: 8 },
  dropText: { fontWeight: 500, fontSize: '.9rem', marginBottom: 4 },
  dropSub: { fontSize: '.78rem', color: 'var(--text-muted)' },
  fileSelected: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px',
    background: '#f0f4ff',
    borderRadius: 'var(--radius)',
    marginTop: 14,
    fontSize: '.85rem',
  },
  fileName: { flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeFile: { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 },
  footer: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: '14px 20px',
    borderTop: '1px solid var(--border)',
  },
  success: {
    padding: '12px 14px',
    background: '#d4edda',
    borderRadius: 'var(--radius)',
    color: '#155724',
    fontSize: '.875rem',
    marginTop: 14,
  },
  error: {
    padding: '12px 14px',
    background: '#f8d7da',
    borderRadius: 'var(--radius)',
    color: '#721c24',
    fontSize: '.875rem',
    marginTop: 14,
  },
}

export default function UploadResumeModal({ job, onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') setFile(dropped)
  }

  function handleFileChange(e) {
    const selected = e.target.files[0]
    if (selected) setFile(selected)
  }

  async function handleUpload() {
    if (!file || loading) return
    setLoading(true)
    setError(null)
    try {
      const data = await uploadResume(file, job?.key)
      onSuccess?.(data)
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
          <div style={s.title}>Add candidate via resume</div>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>

        <div style={s.body}>
          <div
            style={s.dropzone(dragging)}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div style={s.fileIcon}>📄</div>
            <div style={s.dropText}>Drop a PDF resume here</div>
            <div style={s.dropSub}>or click to browse</div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {file && (
            <div style={s.fileSelected}>
              <span>📄</span>
              <span style={s.fileName}>{file.name}</span>
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button style={s.removeFile} onClick={() => { setFile(null); setResult(null); setError(null) }}>✕</button>
            </div>
          )}

          {error && <div style={s.error}>⚠ {error}</div>}
        </div>

        <div style={s.footer}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={!file || loading}
          >
            {loading ? '⏳ Parsing…' : 'Upload & parse'}
          </button>
        </div>
      </div>
    </div>
  )
}
