import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import JobView from '../components/JobView'
import CandidatePanel from '../components/CandidatePanel'
import { getInitData, getJob } from '../services/api'
import { storage } from '../services/storage'

const LS_KEY = 'hrflow_pending_job_keys'

function getPendingKeys() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function setPendingKeys(keys) {
  localStorage.setItem(LS_KEY, JSON.stringify(keys))
}
export function registerPendingJob(key) {
  const keys = getPendingKeys()
  if (!keys.includes(key)) setPendingKeys([...keys, key])
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState(() => storage.get('jobs') || [])
  const [loadingJobs, setLoadingJobs] = useState(jobs.length === 0)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  // processingProfiles: { [profileKey]: statusLabel } — shared across panel + list
  const [processingProfiles, setProcessingProfiles] = useState({})
  const [candidateRefreshKey, setCandidateRefreshKey] = useState(0)
  const [candidateOverride, setCandidateOverride] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  function handleJobStatusChange(jobKey, status) {
    setJobs((prev) => {
      const updated = prev.map((j) => (j.key === jobKey ? { ...j, status } : j))
      storage.set('jobs', updated)
      return updated
    })
    if (selectedJob?.key === jobKey) {
      setSelectedJob((prev) => ({ ...prev, status }))
    }
  }

  function handleCandidateStageChange(profileKey, stage) {
    setCandidateOverride((prev) => ({ ...prev, profileKey, stage }))
  }

  function setProcessing(profileKey, status) {
    setProcessingProfiles((prev) =>
      status ? { ...prev, [profileKey]: status } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== profileKey))
    )
    // Trigger a list refresh when entering "Updating profile…" — this is when we expect HRFlow to have indexed
    if (status === 'Mise à jour du profil…') {
      setCandidateRefreshKey((k) => k + 1)
      // Safety timeout: clear "Mise à jour du profil…" after 8s if indexing/refresh is slow
      setTimeout(() => {
        setProcessingProfiles(prev => {
          if (prev[profileKey] === 'Mise à jour du profil…') {
            const next = { ...prev }
            delete next[profileKey]
            return next
          }
          return prev
        })
      }, 8000)
    }
  }

  async function fetchJobs() {
    const hadData = jobs.length > 0
    if (!hadData) setLoadingJobs(true)
    
    try {
      const { jobs: list, trackings, profiles } = await getInitData()
      
      // Process trackings and profiles into candidate lists per job
      const candidatesByJob = {}
      const profilesMap = Object.fromEntries(profiles.map(p => [p.key, p]))
      
      trackings.forEach(t => {
        const jobKey = t.job_key || t.job?.key
        const profileKey = t.profile_key || t.profile?.key
        if (!jobKey || !profileKey) return
        
        if (!candidatesByJob[jobKey]) candidatesByJob[jobKey] = []
        
        const p = profilesMap[profileKey]
        const info = p?.info || t.profile?.info || {}
        
        let score = null, base_score = null, ai_adjustment = 0, bonus = 0, stage = t.stage || 'applied'
        
        if (p) {
          const scoreTag = (p.tags || []).find(tag => tag.name === `job_data_${jobKey}`)
          if (scoreTag) {
            try {
              const d = JSON.parse(scoreTag.value)
              base_score = d.base_score ?? null
              ai_adjustment = d.ai_adjustment ?? 0
              bonus = d.bonus ?? 0
              if (base_score !== null) score = base_score + ai_adjustment
            } catch {}
          }
          const stageTag = (p.tags || []).find(tag => tag.name === `stage_${jobKey}`)
          if (stageTag) {
            try { stage = JSON.parse(stageTag.value).stage || stage } catch {}
          }
        }
        
        candidatesByJob[jobKey].push({
          profile_key: profileKey,
          first_name: info.first_name || '',
          last_name: info.last_name || '',
          email: info.email || '',
          picture: info.picture || '',
          base_score,
          ai_adjustment,
          score,
          bonus,
          stage,
          tracking_key: t.key
        })
      })
      
      // Save everything to storage
      storage.set('jobs', list)
      Object.entries(candidatesByJob).forEach(([jk, cands]) => {
        storage.set(`candidates_${jk}`, cands)
      })

      // Fetch any pending jobs not yet in HRFlow's search index
      const fetchedKeys = new Set(list.map((j) => j.key))
      const pending = getPendingKeys()
      const stillPending = []
      let updatedList = [...list]
      await Promise.all(
        pending.map(async (key) => {
          if (fetchedKeys.has(key)) return
          try {
            const job = await getJob(key)
            if (job?.key) { updatedList = [...updatedList, job]; stillPending.push(key) }
          } catch { stillPending.push(key) }
        })
      )
      setPendingKeys(stillPending)

      setJobs(updatedList)
      
      // Trigger a refresh on current job view candidates
      setCandidateRefreshKey(k => k + 1)
    } catch (e) {
      console.error(e)
      setFetchError('Échec du chargement des postes. Vérifiez votre connexion réseau.')
    } finally {
      setLoadingJobs(false)
    }
  }

  useEffect(() => { fetchJobs() }, [])
  
  // Update selectedJob if it's in the list and its data changed (e.g. status)
  useEffect(() => {
    if (!selectedJob) return
    const updated = jobs.find(j => j.key === selectedJob.key)
    if (updated && JSON.stringify(updated) !== JSON.stringify(selectedJob)) {
      setSelectedJob(updated)
    }
  }, [jobs, selectedJob?.key])

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', flexDirection: 'column' }}>
      {fetchError && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', color: '#b91c1c', fontSize: '.8rem', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: '1rem', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <Sidebar
        jobs={jobs}
        selectedJobKey={selectedJob?.key}
        onSelectJob={setSelectedJob}
        loading={loadingJobs}
        onDataChanged={fetchJobs}
      />

      <JobView
        job={selectedJob}
        onSelectCandidate={(c) => setSelectedCandidate(c)}
        processingProfiles={processingProfiles}
        refreshKey={candidateRefreshKey}
        candidateOverride={candidateOverride}
        selectedProfileKey={selectedCandidate?.profile_key}
        onCandidateRefreshed={(c) => {
          if (c.last_name || c.first_name) setSelectedCandidate(c)
          // Clear any lingering "Updating profile…" banner now that the refresh is done
        const pk = c.profile_key
        if (pk) {
          setProcessingProfiles(prev => {
            if (prev[pk] === 'Mise à jour du profil…') { // <--- CORRECTION ICI
              const next = { ...prev }
              delete next[pk]
              return next
            }
            return prev
          })
        }
        }}
        onProcessingChange={setProcessing}
        onJobStatusChange={handleJobStatusChange}
        onScoreReady={(scoreData) => {
          if (scoreData)
            setCandidateOverride({ profileKey: scoreData.profileKey || selectedCandidate?.profile_key, ...scoreData })
        }}
        onSynthesisReady={(synthesis) => {
          if (selectedCandidate)
            setCandidateOverride({ profileKey: selectedCandidate.profile_key, synthesis })
        }}
      />

      {selectedCandidate && (
        <CandidatePanel
          candidateRef={selectedCandidate}
          job={selectedJob}
          onClose={() => setSelectedCandidate(null)}
          onProcessingChange={setProcessing}
          onScoreReady={(scoreData) => {
            if (selectedCandidate && scoreData)
              setCandidateOverride({ profileKey: selectedCandidate.profile_key, ...scoreData })
          }}
          onSynthesisReady={(synthesis) => {
            if (selectedCandidate)
              setCandidateOverride({ profileKey: selectedCandidate.profile_key, synthesis })
          }}
          processingStatus={processingProfiles[selectedCandidate.profile_key] || null}
          onStageChange={handleCandidateStageChange}
          onBonusSaved={(bonusDecimal) => {
            setCandidateOverride({ profileKey: selectedCandidate.profile_key, bonus: bonusDecimal })
          }}
        />
      )}
      </div>
    </div>
  )
}
