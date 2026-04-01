const PREFIX = 'hrflow_v1_'

export const storage = {
  get: (key) => {
    try {
      const val = localStorage.getItem(PREFIX + key)
      return val ? JSON.parse(val) : null
    } catch (e) {
      console.error('Storage get error', e)
      return null
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(val))
    } catch (e) {
      console.error('Storage set error', e)
    }
  },
  remove: (key) => {
    localStorage.removeItem(PREFIX + key)
  },
  clear: () => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(PREFIX)) localStorage.removeItem(k)
    })
  }
}
