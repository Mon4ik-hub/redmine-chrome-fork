import i18n from '@/i18n'

const REQUEST_TIMEOUT = 180000 // 180 seconds

// The poll interval range in minutes, shared by the options form and the
// background service worker. chrome.alarms enforces a 30-second minimum
// period, so one minute is the floor; the ceiling keeps polling from
// turning into "never"
export const MIN_POLL_INTERVAL = 1

export const MAX_POLL_INTERVAL = 120

export const DEFAULT_POLL_INTERVAL = 10

export default {
  setBadgeText (text) {
    chrome.action.setBadgeText({ text })
  },

  async getBadgeText () {
    if (chrome?.action) {
      return chrome.action.getBadgeText({})
    }
    return ''
  },

  async setStorage (key, value) {
    const data = JSON.stringify(value)

    if (chrome?.storage?.local) {
      try {
        await chrome.storage.local.set({ [key]: data })
      } catch (error) {
        console.error('Chrome storage set error:', error)
        // Fallback to localStorage
        localStorage[key] = data
      }
    } else {
      localStorage[key] = data
    }
  },

  async getStorage (key = 'options') {
    try {
      if (chrome?.storage?.local) {
        const res = await chrome.storage.local.get([key])

        if (!res[key]) {
          return null
        }

        try {
          return JSON.parse(res[key])
        } catch (parseError) {
          console.error('Storage parse error:', parseError, 'key:', key)
          // Only clear data for 'options' key, preserve 'data' key
          if (key === 'options') {
            chrome.storage.local.remove([key]).catch(() => {})
          }
          return null
        }
      }

      if (!localStorage[key]) {
        return null
      }

      try {
        return JSON.parse(localStorage[key])
      } catch (parseError) {
        console.error('localStorage parse error:', parseError, 'key:', key)
        // Only clear data for 'options' key, preserve 'data' key
        if (key === 'options') {
          delete localStorage[key]
        }
        return null
      }
    } catch (error) {
      console.error('Storage get error:', error)
      return null
    }
  },

  async removeStorage (keys) {
    const list = [].concat(keys)

    if (chrome?.storage?.local) {
      try {
        await chrome.storage.local.remove(list)
        return
      } catch (error) {
        console.error('Chrome storage remove error:', error)
      }
    }
    for (const key of list) {
      delete localStorage[key]
    }
  },

  // Raw request: returns the whole parsed response, including the
  // total_count envelope that pagination needs
  async requestAPI (options, name, params = {}) {
    const baseUrl = options.url.endsWith('/') ?
      options.url.slice(0, -1) : options.url
    const urlParams = new URLSearchParams()

    urlParams.append('key', options.key)
    for (const [key, value] of Object.entries(params)) {
      urlParams.append(key, value)
    }

    const url = `${baseUrl}/${name}.json?${urlParams.toString()}`

    try {
      // Add timeout mechanism (30 seconds)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
      const response = await fetch(url, { signal: controller.signal })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('API request timeout:', url)
        throw new Error(`Request timeout after ${REQUEST_TIMEOUT / 1000} seconds`)
      }
      console.error('API request failed:', error)
      throw error
    }
  },

  async getAPI (options, name, params = {}) {
    const data = await this.requestAPI(options, name, params)

    return data[name] || data
  },

  // Redmine caps list endpoints at 100 items per page, so walk every page
  // until total_count is reached
  async getAPIAll (options, name, params = {}) {
    const limit = 100
    const items = []
    let offset = 0
    let total = Infinity
    let page = null

    do {
      const data = await this.requestAPI(options, name, { ...params, limit, offset })

      page = data[name] || []
      items.push(...page)
      total = data.total_count ?? items.length
      offset += page.length
      // Hard cap against servers reporting bogus totals
      if (items.length >= 10000) {
        break
      }
    } while (page.length && offset < total)

    return items
  },

  filterIssues (issues, data, role) {
    return issues.filter(issue => {
      for (const [key, obj] of Object.entries(data)) {
        if (key === role) {
          return true
        }
        if (obj.issues?.find(item => item.id === issue.id)) {
          return false
        }
      }
      return true
    })
  },

  getUUID (issue) {
    return issue.id + new Date(issue.updated_on).getTime()
  },

  convertTextile (text) {
    if (!text) {
      return ''
    }

    try {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\n/g, '<br>')
    } catch (error) {
      console.error('Textile conversion error:', error)
      return text
    }
  },

  getBrowserLanguage () {
    let browserLanguage = chrome?.i18n?.getUILanguage?.() || navigator.language || navigator.userLanguage

    browserLanguage = browserLanguage.replace('-', '_')

    if (Object.keys(i18n).includes(browserLanguage)) {
      return browserLanguage
    }

    return 'zh_CN'
  },

  async copyIssueId (id) {
    try {
      await navigator.clipboard.writeText(`#${id}`)
    } catch {
      // Fallback to textarea if clipboard API fails
      const textarea = document.createElement('textarea')

      textarea.value = `#${id}`
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }
}
