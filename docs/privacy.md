# Privacy Policy

## Data Collection

This extension uses the following permissions to provide its functionality:

1. **`notifications`**: Used to display desktop notifications for Redmine issue updates
2. **`storage`**: Uses `chrome.storage.local` to save your settings (e.g., preferences) ​**only on your device**
3. **`alarms`**: Used to schedule periodic checks for new issues from your Redmine server
4. **`tabs`**: Used only to open the options page when the extension is first installed and no configuration exists
5. **`host_permissions`**: Access to all HTTP and HTTPS hosts to communicate with your configured Redmine server

No data is transmitted to our servers.

## Storage Details

- ​**Type**: Local storage (not synced)
- ​**Retention**: Data remains until manually deleted by the user.
- ​**Data stored**:
  - Your Redmine server URL and API key
  - Local cache of issues and notification settings
  - User preferences (refresh interval, notification settings, etc.)

## Permission Usage Details

### `tabs` Permission
- **Purpose**: Automatically opens the options page when you first install the extension and haven't configured it yet
- **Usage**: Only used once during initial setup if no configuration is found
- **No tracking**: The extension does not track or access any other tabs or browsing activity

### `alarms` Permission
- **Purpose**: Schedule periodic requests to your Redmine server to check for new/updated issues
- **Frequency**: Configurable by the user (default 5 minutes)
- **No external access**: Alarms are only used internally to trigger extension updates
