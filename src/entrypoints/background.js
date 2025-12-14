import Utils from '@/utils'
import { onMessage } from '@/utils/messaging'

class Background {
  constructor () {
    this.unreadCount = 0

    this.init()
  }

  async init () {
    try {
      if (!await this.initOptions()) {
        return
      }
      // Listen for alarm events
      chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === 'refreshAlarm') {
          this.initRequest().catch(error => {
            console.error('Error in initRequest from alarm:', error)
          })
        }
      })
      await this.initRequest()
    } catch (error) {
      console.error('Error initializing background:', error)
    }
  }

  async initOptions () {
    this.options = await Utils.getStorage('options')

    if (!this.options) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('options.html')
      })
      return false
    }

    this.data = await Utils.getStorage('data') || {}
    return true
  }

  async initRequest () {
    try {
      this.error = false
      console.log('Starting initRequest...')

      // Ensure options.issues exists and is an array
      if (!this.options.issues || !Array.isArray(this.options.issues)) {
        console.error('options.issues is not properly defined:', this.options.issues)
        this.error = true
      } else {
        for (const role of this.options.issues) {
          console.log(`Processing role: ${role}`)
          await this.getList(role)
        }

        await Utils.setStorage('data', this.data)
        console.log('initRequest completed successfully')
      }
    } catch (error) {
      console.error('Error in initRequest:', error)
      this.error = true
    } finally {
      // Always update badge text and create alarm, even if there was an error
      Utils.setBadgeText(this.error ? 'x' : this.unreadCount > 0 ? `${this.unreadCount}` : '')
      this.unreadCount = 0

      // Always clear and create new alarm to ensure periodic checks continue
      await chrome.alarms.clearAll()
      chrome.alarms.create('refreshAlarm', {
        delayInMinutes: this.options.interval || 5 // Default to 5 minutes if not set
      })
      console.log('Alarm set for next refresh in', this.options.interval || 5, 'minutes')
    }
  }

  setQuery (query, name, values) {
    query[name] = values.join('|')
  }

  async getList (role) {
    try {
      const query = {
        set_filter: 1,
        sort: 'updated_on:desc',
        limit: this.options.number,
        key: this.options.key,
        [role]: 'me'
      }

      // this.setQuery(query, 'project_id', this.options.projects)
      this.setQuery(query, 'status_id', this.options.status)
      this.setQuery(query, 'tracker_id', this.options.trackers)

      if (!this.data[role]) {
        this.data[role] = {}
      }

      const res = await Utils.getAPI(this.options, 'issues', query)
      const lastRead = new Date(0)
      const lastNotified = new Date(0)
      const unreadList = []
      let readList = []

      this.data[role].issues = Utils.filterIssues(res, this.data, role)
      this.data[role].error = false

      if (this.data[role].lastRead) {
        lastRead.setTime(this.data[role].lastRead)
      }

      if (this.data[role].lastNotified) {
        lastNotified.setTime(this.data[role].lastNotified)
      }

      if (this.data[role].readList) {
        readList = this.data[role].readList
      } else {
        this.data[role].readList = []
      }

      let count = 0

      for (let i = this.data[role].issues.length - 1; i >= 0; i--) {
        const issue = this.data[role].issues[i]
        const updatedOn = new Date(issue.updated_on)
        const uuid = Utils.getUUID(issue)

        if (lastRead < updatedOn) {
          if (!readList.includes(uuid)) {
            count++
            unreadList.push(uuid)
          }
        }
        if (lastNotified < updatedOn) {
          lastNotified.setTime(updatedOn.getTime())
          if (count < 4) {
            this.showNotification(issue)
          }
        }
      }

      this.data[role].lastNotified = lastNotified.getTime()
      this.data[role].unreadList = unreadList
      this.unreadCount += count
    } catch (error) {
      console.error(`Error fetching list for role ${role}:`, error)
      this.data[role].error = true
      this.error = true
    }
  }

  showNotification (issue) {
    if (
      !this.options.notify ||
      !this.options.notify_status.includes(issue.status.id)
    ) {
      return
    }

    chrome.notifications.create(`${new Date().getTime()}`, {
      type: 'basic',
      title: issue.subject,
      message: Utils.convertTextile(issue.description).replace(/<[^>]+>/g, ''),
      iconUrl: chrome.runtime.getURL('icon-128.png')
    }, id => {
      setTimeout(() => {
        chrome.notifications.clear(id, () => {})
      }, 5000)
    })
  }

  refresh () {
    // Clear all alarms and refresh immediately
    chrome.alarms.clearAll().then(() => {
      this.initRequest()
    })
  }

  destroy () {
    chrome.alarms.clearAll()
  }

  reset () {
    Utils.setBadgeText('')
    Utils.setStorage('data', {})
    this.refresh()
  }
}

export default defineBackground(() => {
  let background = new Background()

  // Add error handling for unhandled promise rejections
  self.addEventListener('unhandledrejection', event => {
    console.error('Background service worker unhandled rejection:', event.reason)
  })

  // Add error handling for general errors
  self.addEventListener('error', event => {
    console.error('Background service worker error:', event.error)
  })

  onMessage('OPTIONS_SAVED', async () => {
    try {
      background?.destroy()
      background = new Background()
      return { success: true }
    } catch (error) {
      console.error('Error handling OPTIONS_SAVED:', error)
      return { success: false, error: error.message }
    }
  })

  return () => {
    background?.destroy()
  }
})
