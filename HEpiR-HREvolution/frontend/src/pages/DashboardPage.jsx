import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import JobView from '../components/JobView'
import CandidatePanel from '../components/CandidatePanel'
import { getJobs, getJob } from '../services/api'

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
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  // processingProfiles: { [profileKey]: statusLabel } — shared across panel + list
  const [processingProfiles, setProcessingProfiles] = useState({})
  const [candidateRefreshKey, setCandidateRefreshKey] = useState(0)
  const [candidateOverride, setCandidateOverride] = useState(null)

  function handleJobStatusChange(jobKey, status) {
    setJobs((prev) => prev.map((j) => (j.key === jobKey ? { ...j, status } : j)))
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
    // When processing finishes, trigger a list refresh so scores update
    if (!status) setCandidateRefreshKey((k) => k + 1)
  }

  async function fetchJobs() {
    setLoadingJobs(true)
    try {
      const data = await getJobs()
      let list = data.jobs || []
      const fetchedKeys = new Set(list.map((j) => j.key))

      // Fetch any pending jobs not yet in HRFlow's search index
      const pending = getPendingKeys()
      const stillPending = []
      await Promise.all(
        pending.map(async (key) => {
          if (fetchedKeys.has(key)) return  // already indexed, drop from pending
          try {
            const job = await getJob(key)
            if (job?.key) { list = [...list, job]; stillPending.push(key) }
          } catch { stillPending.push(key) }
        })
      )
      setPendingKeys(stillPending)

      setJobs(list)
      if (list.length > 0 && !selectedJob) setSelectedJob(list[0])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingJobs(false)
    }
  }

  useEffect(() => { fetchJobs() }, [])

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
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
        onCandidateRefreshed={(c) => setSelectedCandidate(c)}
        onProcessingChange={setProcessing}
        onJobStatusChange={handleJobStatusChange}
      />

      {selectedCandidate && (
        <CandidatePanel
          candidateRef={selectedCandidate}
          job={selectedJob}
          onClose={() => setSelectedCandidate(null)}
          onProcessingChange={setProcessing}
          processingStatus={processingProfiles[selectedCandidate.profile_key] || null}
          onStageChange={handleCandidateStageChange}
          onBonusSaved={(bonusDecimal) => {
            setCandidateOverride({ profileKey: selectedCandidate.profile_key, bonus: bonusDecimal })
            setCandidateRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
