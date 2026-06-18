import { supabase, hasSupabaseConfig } from './supabaseClient'
export { hasSupabaseConfig } from './supabaseClient'

const STORAGE_KEY = 'remember-you-local-v1'
const COMMENT_KEY = 'remember-you-comments-v1'
const ATTACHMENT_KEY = 'remember-you-attachments-v1'
const IMAGE_BUCKET = 'remember-images'
const DONE_STATUS = '已完成'
const DEFAULT_SPACE = 'shared'
const MAX_ATTACHMENTS = 3

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

function localAttachments() {
  return readLocal(ATTACHMENT_KEY, [])
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
    writeLocal(ATTACHMENT_KEY, localAttachments().filter((attachment) => attachment.item_id !== id))
    return
  }

  const attachments = await listAttachments(id)
  const paths = attachments.map((attachment) => attachment.path)
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(IMAGE_BUCKET).remove(paths)
    if (removeError) throw removeError
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

export async function listAttachments(itemId) {
  if (!hasSupabaseConfig) {
    return localAttachments().filter((attachment) => attachment.item_id === itemId)
  }

  const { data, error } = await supabase
    .from('item_attachments')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true })
  if (error) throw error

  const withUrls = await Promise.all((data || []).map(async (attachment) => {
    const { data: signed, error: signedError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(attachment.path, 60 * 10)
    if (signedError) return { ...attachment, signedUrl: '', signedError: signedError.message }
    return { ...attachment, signedUrl: signed.signedUrl }
  }))

  return withUrls
}

export async function uploadAttachment(itemId, image) {
  if (!hasSupabaseConfig) {
    const current = localAttachments().filter((attachment) => attachment.item_id === itemId)
    if (current.length >= MAX_ATTACHMENTS) throw new Error('一条记录最多只能放 3 张图片。')
    const attachment = {
      id: crypto.randomUUID(),
      item_id: itemId,
      bucket: 'local',
      path: image.previewUrl,
      file_name: image.file.name,
      mime_type: image.blob.type,
      size_bytes: image.blob.size,
      width: image.width,
      height: image.height,
      signedUrl: image.previewUrl,
      created_at: new Date().toISOString(),
    }
    writeLocal(ATTACHMENT_KEY, [...localAttachments(), attachment])
    return attachment
  }

  const current = await listAttachments(itemId)
  if (current.length >= MAX_ATTACHMENTS) throw new Error('一条记录最多只能放 3 张图片。')

  const user = await getCurrentUser()
  const extension = image.blob.type === 'image/png' ? 'png' : image.blob.type === 'image/jpeg' ? 'jpg' : 'webp'
  const path = `${user.id}/${itemId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, image.blob, {
      contentType: image.blob.type,
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadError) throw uploadError

  const payload = {
    item_id: itemId,
    bucket: IMAGE_BUCKET,
    path,
    file_name: image.file.name,
    mime_type: image.blob.type,
    size_bytes: image.blob.size,
    width: image.width,
    height: image.height,
    created_by: user.id,
  }

  const { data, error } = await supabase
    .from('item_attachments')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path])
    throw error
  }

  await updateItem(itemId, { updated_at: new Date().toISOString() })
  return data
}

export async function deleteAttachment(attachment) {
  if (!hasSupabaseConfig) {
    writeLocal(ATTACHMENT_KEY, localAttachments().filter((item) => item.id !== attachment.id))
    return
  }

  const { error: removeError } = await supabase.storage.from(IMAGE_BUCKET).remove([attachment.path])
  if (removeError) throw removeError

  const { error } = await supabase.from('item_attachments').delete().eq('id', attachment.id)
  if (error) throw error
}
