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
      />

      {selectedCandidate && (
        <CandidatePanel
          candidateRef={selectedCandidate}
          job={selectedJob}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </div>
  )
}
