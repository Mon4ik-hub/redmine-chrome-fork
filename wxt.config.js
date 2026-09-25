import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: () => ({
    name: 'Redmine Notification',
    author: 'Denis Monakhov',
    homepage_url: 'https://github.com/Mon4ik-hub/redmine-chrome-fork',
    permissions: ['alarms', 'notifications', 'storage', 'tabs'],
    host_permissions: ['http://*/*', 'https://*/*', 'http://localhost/*'],
    action: {
      default_icon: {
        16: 'icon-128.png',
        32: 'icon-128.png',
        48: 'icon-128.png',
        128: 'icon-128.png'
      },
      default_title: 'Redmine Notification'
    }
  }),
  srcDir: 'src',
  outDir: 'output',
  modules: [
    '@wxt-dev/module-vue'
  ],
  imports: {
    eslintrc: {
      enabled: 9
    }
  }
})
