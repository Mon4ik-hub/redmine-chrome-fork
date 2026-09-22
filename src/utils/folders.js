import Utils from '@/utils'

// Folders live in their own storage key. Issues are bound to folders by
// their eternal Redmine id, so any future change of a task (new comment,
// status update, ...) automatically lands in the folder it belongs to.
//
// Shape: { list: [{ id, name, createdAt }], assignments: { [issueId]: folderId } }
const FOLDERS_KEY = 'folders'

export const emptyFoldersData = () => ({ list: [], assignments: {} })

export const getFoldersData = async () =>
  await Utils.getStorage(FOLDERS_KEY) || emptyFoldersData()

export const saveFoldersData = async data => {
  await Utils.setStorage(FOLDERS_KEY, data)
}

export const createFolder = async name => {
  const trimmed = name.trim()

  if (!trimmed) {
    return null
  }

  const data = await getFoldersData()
  const folder = {
    id: `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    createdAt: Date.now()
  }

  data.list.push(folder)
  await saveFoldersData(data)
  return folder
}

// Deleting a folder keeps its issues: they simply lose the assignment and
// show up in the general list again
export const deleteFolder = async folderId => {
  const data = await getFoldersData()

  data.list = data.list.filter(folder => folder.id !== folderId)
  for (const [issueId, id] of Object.entries(data.assignments)) {
    if (id === folderId) {
      delete data.assignments[issueId]
    }
  }
  await saveFoldersData(data)
}

export const moveIssueToFolder = async (issueId, folderId) => {
  const data = await getFoldersData()

  if (!data.list.some(folder => folder.id === folderId)) {
    return
  }
  data.assignments[issueId] = folderId
  await saveFoldersData(data)
}

// Returns the task to the general list
export const removeIssueFromFolder = async issueId => {
  const data = await getFoldersData()

  if (data.assignments[issueId] === undefined) {
    return
  }
  delete data.assignments[issueId]
  await saveFoldersData(data)
}
