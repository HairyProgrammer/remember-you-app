import { supabase, hasSupabaseConfig } from './supabaseClient'
export { hasSupabaseConfig } from './supabaseClient'

const STORAGE_KEY = 'remember-you-local-v1'
const COMMENT_KEY = 'remember-you-comments-v1'
const DONE_STATUS = '已完成'
const DEFAULT_SPACE = 'shared'

const seedItems = [
  {
    id: crypto.randomUUID(),
    title: '周末去植物园',
    space: 'shared',
    category: '想一起做',
    status: '待确认',
    note: '找一个天气好的下午，慢慢逛，不赶时间。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    seen_at: null,
    created_by: 'local',
  },
  {
    id: crypto.randomUUID(),
    title: '准备一个小惊喜',
    space: 'mine',
    category: '礼物灵感',
    status: '已记下',
    note: '先收集她最近随口提到过的小东西。',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    seen_at: new Date().toISOString(),
    created_by: 'local',
  },
]

function normalizeItem(item) {
  return { ...item, space: item.space || DEFAULT_SPACE }
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function localItems() {
  const existing = readLocal(STORAGE_KEY, null)
  if (existing) return existing.map(normalizeItem)
  writeLocal(STORAGE_KEY, seedItems)
  return seedItems
}

function localComments() {
  return readLocal(COMMENT_KEY, [])
}

export async function getCurrentUser() {
  if (!hasSupabaseConfig) {
    return { id: 'local', email: 'local@preview', user_metadata: { display_name: '本地预览' } }
  }
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

export async function getSession() {
  if (!hasSupabaseConfig) return { user: await getCurrentUser() }
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function signIn(email, password) {
  if (!hasSupabaseConfig) return { user: await getCurrentUser() }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email, password, displayName) {
  if (!hasSupabaseConfig) return { user: await getCurrentUser() }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email } },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  if (!hasSupabaseConfig) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function listItems() {
  if (!hasSupabaseConfig) {
    return localItems().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeItem)
}

export async function addItem(item) {
  const now = new Date().toISOString()
  const nextItem = { ...item, space: item.space || DEFAULT_SPACE }
  if (!hasSupabaseConfig) {
    const next = [{ ...nextItem, id: crypto.randomUUID(), created_at: now, updated_at: now, created_by: 'local', completed_at: null, seen_at: null }, ...localItems()]
    writeLocal(STORAGE_KEY, next)
    return next[0]
  }
  const user = await getCurrentUser()
  const payload = { ...nextItem, created_by: user.id, updated_by: user.id }
  const { data, error } = await supabase.from('items').insert(payload).select('*').single()
  if (error) throw error
  return normalizeItem(data)
}

export async function updateItem(id, patch) {
  const now = new Date().toISOString()
  const nextPatch = { ...patch, updated_at: now }
  if (patch.status === DONE_STATUS) nextPatch.completed_at = now
  if (patch.status && patch.status !== DONE_STATUS) nextPatch.completed_at = null

  if (!hasSupabaseConfig) {
    const next = localItems().map((item) => item.id === id ? normalizeItem({ ...item, ...nextPatch }) : item)
    writeLocal(STORAGE_KEY, next)
    return next.find((item) => item.id === id)
  }
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from('items')
    .update({ ...nextPatch, updated_by: user.id })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return normalizeItem(data)
}

export async function deleteItem(id) {
  if (!hasSupabaseConfig) {
    writeLocal(STORAGE_KEY, localItems().filter((item) => item.id !== id))
    writeLocal(COMMENT_KEY, localComments().filter((comment) => comment.item_id !== id))
    return
  }
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw error
}

export async function markSeen(id) {
  const now = new Date().toISOString()
  if (!hasSupabaseConfig) return updateItem(id, { seen_at: now, seen_by: 'local' })
  const user = await getCurrentUser()
  return updateItem(id, { seen_at: now, seen_by: user.id })
}

export async function listComments(itemId) {
  if (!hasSupabaseConfig) return localComments().filter((comment) => comment.item_id === itemId)
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addComment(itemId, content) {
  const now = new Date().toISOString()
  if (!hasSupabaseConfig) {
    const comment = { id: crypto.randomUUID(), item_id: itemId, content, user_id: 'local', created_at: now }
    writeLocal(COMMENT_KEY, [...localComments(), comment])
    await updateItem(itemId, { updated_at: now })
    return comment
  }
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from('comments')
    .insert({ item_id: itemId, content, user_id: user.id })
    .select('*')
    .single()
  if (error) throw error
  await updateItem(itemId, { updated_at: now })
  return data
}
