import { useState, useEffect, useRef } from 'react'
import { getExtraDocuments, uploadExtraDocument, uploadExtraDocumentFile, gradeCandidate, transcribeAudio } from '../services/api'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function preview(content) {
  const lines = (content || '').split('\n').slice(0, 2).join(' ')
  return lines.length > 120 ? lines.slice(0, 120) + '…' : lines || '(vide)'
}

// ---------------------------------------------------------------------------
// Text viewer panel (full content overlay)
// ---------------------------------------------------------------------------

function TextViewerPanel({ doc, onClose }) {
  const [closing, setClosing] = useState(false)

  function handleClose() {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 220)
  }

  return (
    <div style={sv.overlay} className={closing ? 'anim-overlay-exit' : 'anim-overlay'} onClick={handleClose}>
      <div style={sv.panel} className={closing ? 'anim-modal-exit' : 'anim-modal'} onClick={(e) => e.stopPropagation()}>
        <div style={sv.header}>
          <div style={sv.headerLeft}>
            <span style={{ fontSize: '1.1rem' }}>📄</span>
            <div>
              <div style={sv.filename}>{doc.filename}</div>
              <div style={sv.meta}>{doc.uploaded_by}{doc.uploaded_by ? ' · ' : ''}{formatDate(doc.uploaded_at)}</div>
            </div>
          </div>
          <button style={sv.closeBtn} onClick={handleClose}>✕</button>
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
          {doc.processing ? (
            <div className="spinner" style={{ width: 14, height: 14, margin: 0, borderTopColor: '#fff', borderLeftColor: 'rgba(255,255,255,0.3)', borderBottomColor: 'rgba(255,255,255,0.3)', borderRightColor: 'rgba(255,255,255,0.3)' }} />
          ) : (
            <DeltaBadge delta={doc.delta} />
          )}
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
          Voir le texte complet ›
        </button>
        <div style={sb.footer}>
          {doc.uploaded_by === 'You' ? 'Vous' : doc.uploaded_by}{doc.uploaded_by ? ' · ' : ''}
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
// Voice recorder
// ---------------------------------------------------------------------------

const IconMic = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
);

const IconSquare = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="5" y="5" rx="2"/></svg>
);

const IconPaperclip = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
);

function bufferToWave(abuffer, len) {
  let numOfChan = abuffer.numberOfChannels,
    length = len * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [], i, sample,
    offset = 0, pos = 0;

  const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
  setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
  setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);

  for (i = 0; i < numOfChan; i++) channels.push(abuffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function VoiceRecorder({ onTranscribed, disabled }) {
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase('transcribing');
        
        try {
          // 1. Créer un blob à partir des données WebM enregistrées par le navigateur
          const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
          
          // 2. Convertir WebM -> WAV pour la compatibilité Mistral
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const arrayBuffer = await webmBlob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const wavBlob = bufferToWave(audioBuffer, audioBuffer.length);
          
          // 3. Envoyer le fichier .wav
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const file = new File([wavBlob], `voice_note_${ts}.wav`, { type: 'audio/wav' });

          const result = await transcribeAudio(file);
          onTranscribed(result.text);
        } catch (e) {
          console.error(e);
          setError('Erreur lors de la transcription ou conversion.');
        } finally {
          setPhase('idle');
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setPhase('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError('Accès au microphone refusé.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && phase === 'recording') {
      mediaRecorderRef.current.stop();
      clearInterval(timerRef.current);
    }
  };

  const fmt = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {phase === 'idle' && (
        <button
          className="btn-secondary"
          onClick={startRecording}
          disabled={disabled}
          title="Enregistrer une note vocale — la transcription apparaîtra dans la zone de texte pour modification"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconMic /> Enregistrer
        </button>
      )}
      {phase === 'recording' && (
        <>
          <span style={{ fontSize: '.75rem', color: '#e01e5a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="rec-dot" />
            {fmt}
          </span>
          <button
            className="btn-secondary"
            onClick={stopRecording}
            style={{ 
              borderColor: '#e01e5a', 
              color: '#e01e5a', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px' 
            }}
          >
            <IconSquare /> Arrêter
          </button>
        </>
      )}
      {phase === 'transcribing' && (
        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="spinner" style={{ width: 12, height: 12 }} />
          Transcription…
        </span>
      )}
      {error && <span style={{ fontSize: '.75rem', color: '#c0392b' }}>{error}</span>}
    </div>
  )
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
  const textareaRef = useRef(null)

  const handleTranscribed = (text) => {
    setContent((prev) => prev ? prev + '\n' + text : text)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

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
        placeholder="Nom du fichier (optionnel, ex: notes_entretien)"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        disabled={sending}
      />
      <textarea
        ref={textareaRef}
        style={si.textarea}
        placeholder="Tapez ou collez du contenu textuel… (Ctrl+Entrée pour envoyer)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKey}
        disabled={sending}
        rows={6}
      />
      {error && <div style={si.error}>{error}</div>}
      <div style={si.footer}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept=".pdf,.docx,.doc,.mp3,.m4a,.wav,.webm,.txt"
          />
          <button
            className="btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            title="Télécharger audio (mp3, m4a, wav), texte (pdf, docx, txt)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
          <IconPaperclip /> {sending ? '...' : 'Télécharger le fichier'}
          </button>
          <VoiceRecorder onTranscribed={handleTranscribed} disabled={sending} />
          <span style={si.hint}>Ctrl+Entrée pour envoyer</span>
        </div>
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={sending || !content.trim()}
        >
          {sending ? 'Envoi…' : 'Envoyer'}
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
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [documents])

  const handleSend = async (filename, content) => {
    const result = await uploadExtraDocument(profileKey, jobKey, filename, content)
    // Optimistically append — don't wait for HRFlow indexing
    const optimistic = {
      id: result.id || `_opt_${Date.now()}`,
      filename: filename.trim() || 'document',
      content,
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'Vous',
      delta: null,
      delta_rationale: null,
      processing: true,
    }
    setDocuments((prev) => [...prev, optimistic])
    // Auto re-grade then synthesize — onGraded owns the full chain and clears processing
    onProcessingChange?.(profileKey, 'Évaluation…')
    try {
      const gradeResult = await gradeCandidate(jobKey, profileKey)

      // Use documents returned directly from the grading response — avoids HRFlow indexing latency
      if (gradeResult.documents?.length > 0) {
        setDocuments(gradeResult.documents)
      }

      await onGraded?.(gradeResult)  // awaited: score update → synthesis → processing cleared
    } catch (e) {
      console.error('grading failed:', e)
      onProcessingChange?.(profileKey, 'Mise à jour du profil…')
    }
  }

  const handleFileUpload = async (file) => {
    onProcessingChange?.(profileKey, 'Traitement du fichier…')
    try {
      const uploaded = await uploadExtraDocumentFile(profileKey, jobKey, file)
      // Optimistically append extracted content immediately
      const optimistic = {
        id: uploaded.id || `_opt_${Date.now()}`,
        filename: file.name,
        content: uploaded.content || '',
        uploaded_at: new Date().toISOString(),
        uploaded_by: 'Vous',
        delta: null,
        delta_rationale: null,
        processing: true,
      }
      setDocuments((prev) => [...prev, optimistic])
      
      onProcessingChange?.(profileKey, 'Évaluation…')
      const result = await gradeCandidate(jobKey, profileKey)

      if (result.documents?.length > 0) {
        setDocuments(result.documents)
      }

      await onGraded?.(result)
    } catch (e) {
      console.error('file upload/processing failed:', e)
      onProcessingChange?.(profileKey, 'Mise à jour du profil…')
      throw e
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={listRef} key={profileKey + jobKey} style={sd.list}>
        {loading ? (
          <div style={sd.empty}><div className="spinner" /></div>
        ) : documents.length === 0 ? (
          <div style={sd.empty}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Aucun document pour le moment</div>
            <div style={{ fontSize: '.8rem' }}>Envoyez du texte supplémentaire pour enrichir l'évaluation de l'IA.</div>
          </div>
        ) : (
          documents.map((doc, i) => (
            <div
              key={doc.id}
              className="anim-item"
              style={{ '--item-index': Math.min(documents.length - 1 - i, 6) }}
            >
              <DocumentBubble doc={doc} onView={setViewingDoc} />
            </div>
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
