import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  addComment,
  addItem,
  deleteAttachment,
  deleteItem,
  getSession,
  hasSupabaseConfig,
  listAttachments,
  listComments,
  listItems,
  markSeen,
  signIn,
  signOut,
  signUp,
  updateItem,
  uploadAttachment,
} from './storage'

const APP_NAME = import.meta.env.VITE_APP_NAME || '我想记住你的事'
const MAX_ATTACHMENTS = 3
const MAX_IMAGE_SIDE = 1800
const TARGET_IMAGE_BYTES = 1.5 * 1024 * 1024
const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

const spaces = [
  { value: 'mine', label: '我的部分', description: '我答应过的事、我要主动做的事、需要提醒自己的事。' },
  { value: 'hers', label: '她的部分', description: '她想要的小东西、她需要我出现的时候、她希望被我记住的事。' },
  { value: 'shared', label: '共同区', description: '一起做的事、共同约定、相处规则和慢慢靠近的计划。' },
]

const categories = ['想一起做', '重要日子', '礼物灵感', '需要聊聊', '生活待办']
const statuses = ['已记下', '待确认', '这周处理', '已完成', '暂时做不到']
const defaultSpace = 'shared'

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getSpace(value) {
  return spaces.find((space) => space.value === value) || spaces.find((space) => space.value === defaultSpace)
}

function statusClass(status) {
  return `status status-${status.replaceAll(' ', '-')}`
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('图片压缩失败，请换一张图片试试。'))
      else resolve(blob)
    }, type, quality)
  })
}

async function compressImageFile(file) {
  if (!acceptedImageTypes.includes(file.type)) {
    throw new Error(`${file.name} 不是支持的图片格式。只支持 JPEG、PNG、WebP。`)
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const outputType = 'image/webp'
  const qualities = [0.86, 0.78, 0.7, 0.62, 0.54]
  let blob = null
  for (const quality of qualities) {
    blob = await canvasToBlob(canvas, outputType, quality)
    if (blob.size <= TARGET_IMAGE_BYTES) break
  }

  return {
    id: crypto.randomUUID(),
    file,
    blob,
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
    status: 'ready',
    error: '',
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    getSession().then(setSession).finally(() => setAuthLoading(false))
  }, [])

  if (authLoading) return <Shell><p className="muted">正在打开这个小本本...</p></Shell>

  if (!session && hasSupabaseConfig) {
    return <AuthScreen onAuthed={(nextSession) => setSession(nextSession)} />
  }

  return <Notebook onLogout={() => signOut().then(() => setSession(null))} />
}

function Shell({ children }) {
  return <main className="app-shell">{children}</main>
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, displayName)
      const session = await getSession()
      onAuthed(session || data.session)
    } catch (err) {
      setError(err.message || '登录失败，请检查邮箱和密码。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <section className="hero auth-hero">
        <div className="eyebrow">两个人的小本本</div>
        <h1>{APP_NAME}</h1>
        <p>有些话不用反复提醒，也不会被弄丢。我们把重要的小事放在这里，慢慢做，不靠猜，也不靠闹。</p>
      </section>
      <form className="card form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>登录</button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>注册</button>
        </div>
        {mode === 'signup' && (
          <label>
            昵称
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="怎么称呼你" />
          </label>
        )}
        <label>
          邮箱
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
        </label>
        <label>
          密码
          <input type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '处理中...' : mode === 'signin' ? '进入小本本' : '创建账号'}</button>
        <p className="hint">只允许你们两个邮箱登录。未配置 Supabase 时会进入本地预览模式。</p>
      </form>
    </Shell>
  )
}

function Notebook({ onLogout }) {
  const [items, setItems] = useState([])
  const [activeSpace, setActiveSpace] = useState(defaultSpace)
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [selectedStatus, setSelectedStatus] = useState('全部')
  const [detailItem, setDetailItem] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await listItems()
      setItems(data)
      if (detailItem) setDetailItem(data.find((item) => item.id === detailItem.id) || null)
    } catch (err) {
      setError(err.message || '读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const activeSpaceInfo = getSpace(activeSpace)
  const visibleItems = useMemo(() => items.filter((item) => (item.space || defaultSpace) === activeSpace), [items, activeSpace])
  const filtered = useMemo(() => visibleItems.filter((item) => {
    const categoryOk = selectedCategory === '全部' || item.category === selectedCategory
    const statusOk = selectedStatus === '全部' || item.status === selectedStatus
    return categoryOk && statusOk
  }), [visibleItems, selectedCategory, selectedStatus])

  const countsBySpace = useMemo(() => spaces.reduce((next, space) => {
    next[space.value] = items.filter((item) => (item.space || defaultSpace) === space.value).length
    return next
  }, {}), [items])

  async function handleStatus(id, status) {
    await updateItem(id, { status })
    await refresh()
  }

  async function handleSeen(id) {
    await markSeen(id)
    await refresh()
  }

  async function handleDelete(id) {
    if (!confirm('确定删除这条记录吗？图片附件也会一起删除。')) return
    await deleteItem(id)
    setDetailItem(null)
    await refresh()
  }

  return (
    <Shell>
      <header className="topbar">
        <div>
          <div className="eyebrow">两个人的小本本</div>
          <h1>{APP_NAME}</h1>
        </div>
        {hasSupabaseConfig && <button className="ghost" onClick={onLogout}>退出</button>}
      </header>

      {!hasSupabaseConfig && (
        <div className="notice">当前是本地预览模式：数据只保存在此浏览器。配置 Supabase 后可同步到云端并开启登录。</div>
      )}

      <section className="hero">
        <p>把重要的小事放在这里，我们慢慢做，不靠猜，也不靠闹。</p>
      </section>

      <section className="space-tabs" aria-label="记录区域">
        {spaces.map((space) => (
          <button
            key={space.value}
            type="button"
            className={activeSpace === space.value ? 'active' : ''}
            onClick={() => setActiveSpace(space.value)}
          >
            <span>{space.label}</span>
            <strong>{countsBySpace[space.value] || 0}</strong>
          </button>
        ))}
      </section>

      <section className="space-intro">
        <div>
          <h2>{activeSpaceInfo.label}</h2>
          <p>{activeSpaceInfo.description}</p>
        </div>
      </section>

      <section className="filters">
        <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} aria-label="筛选分类">
          <option>全部</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label="筛选状态">
          <option>全部</option>
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </section>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">正在读取...</p> : (
        <section className="list">
          {filtered.length === 0 && <EmptyState space={activeSpaceInfo} />}
          {filtered.map((item) => (
            <article className="item-card" key={item.id} onClick={() => setDetailItem(item)}>
              <div className="item-topline">
                <span className="category">{getSpace(item.space).label} · {item.category}</span>
                <span className={statusClass(item.status)}>{item.status}</span>
              </div>
              <h2>{item.title}</h2>
              {item.note && <p>{item.note}</p>}
              <div className="item-footer">
                <span>{formatDate(item.updated_at)}</span>
                {item.seen_at ? <span>已看过 {formatDate(item.seen_at)}</span> : <span>还没标记看过</span>}
              </div>
            </article>
          ))}
        </section>
      )}

      <button className="floating-add" onClick={() => setShowNew(true)} aria-label="记一件事">+ 记一件事</button>

      {showNew && (
        <NewItemModal
          initialSpace={activeSpace}
          onClose={() => setShowNew(false)}
          onCreated={async () => { setShowNew(false); await refresh() }}
        />
      )}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onRefresh={refresh}
          onStatus={handleStatus}
          onSeen={handleSeen}
          onDelete={handleDelete}
        />
      )}
    </Shell>
  )
}

function EmptyState({ space }) {
  return (
    <div className="empty card">
      <h2>{space.label}还没有记录</h2>
      <p>先放进一件小事。它不用立刻被解决，只要先被好好记住。</p>
    </div>
  )
}

function ImagePicker({ selectedImages, setSelectedImages, existingCount = 0 }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function chooseImages(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    setError('')

    const remaining = MAX_ATTACHMENTS - existingCount - selectedImages.length
    if (remaining <= 0) {
      setError('一条记录最多只能放 3 张图片。')
      return
    }

    setBusy(true)
    const next = []
    for (const file of files.slice(0, remaining)) {
      try {
        next.push(await compressImageFile(file))
      } catch (err) {
        next.push({
          id: crypto.randomUUID(),
          file,
          blob: null,
          previewUrl: '',
          status: 'failed',
          error: err.message || '图片处理失败',
        })
      }
    }
    if (files.length > remaining) setError('已达到 3 张上限，多出来的图片没有加入。')
    setSelectedImages((current) => [...current, ...next])
    setBusy(false)
  }

  function removeImage(id) {
    setSelectedImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
  }

  return (
    <div className="image-picker">
      <label className="file-drop">
        <span>图片附件</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseImages} disabled={busy} />
        <small>{busy ? '正在压缩图片...' : `最多 3 张，会先在浏览器压缩后再上传。`}</small>
      </label>
      {error && <p className="error">{error}</p>}
      {selectedImages.length > 0 && (
        <div className="image-grid">
          {selectedImages.map((image) => (
            <div className="image-tile" key={image.id}>
              {image.previewUrl ? <img src={image.previewUrl} alt="" /> : <div className="image-fallback">失败</div>}
              <button type="button" onClick={() => removeImage(image.id)}>删除</button>
              {image.status === 'failed' && <span>{image.error}</span>}
              {image.status === 'uploading' && <span>上传中...</span>}
              {image.status === 'uploaded' && <span>已上传</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewItemModal({ initialSpace, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [space, setSpace] = useState(initialSpace || defaultSpace)
  const [category, setCategory] = useState(categories[0])
  const [status, setStatus] = useState(statuses[0])
  const [note, setNote] = useState('')
  const [images, setImages] = useState([])
  const [createdItemId, setCreatedItemId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const imagesRef = useRef([])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => () => {
    imagesRef.current.forEach((image) => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl)
    })
  }, [])

  async function uploadSelectedImages(itemId, selected) {
    for (const image of selected) {
      if (!image.blob) continue
      setImages((current) => current.map((item) => item.id === image.id ? { ...item, status: 'uploading', error: '' } : item))
      try {
        await uploadAttachment(itemId, image)
        setImages((current) => current.map((item) => item.id === image.id ? { ...item, status: 'uploaded' } : item))
      } catch (err) {
        setImages((current) => current.map((item) => item.id === image.id ? { ...item, status: 'failed', error: err.message || '上传失败，可重试' } : item))
        throw err
      }
    }
  }

  async function retryImage(image) {
    if (!image.itemId || !image.blob) return
    setBusy(true)
    try {
      await uploadSelectedImages(image.itemId, [image])
    } catch (err) {
      setError(err.message || '上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const item = createdItemId
        ? { id: createdItemId }
        : await addItem({ title, space, category, status, note })
      if (!createdItemId) setCreatedItemId(item.id)
      const uploadable = images.filter((image) => image.blob && image.status !== 'uploaded')
      setImages((current) => current.map((image) => ({ ...image, itemId: item.id })))
      await uploadSelectedImages(item.id, uploadable)
      onCreated()
    } catch (err) {
      setError(err.message || '新增失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="记一件事" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          归属区域
          <select value={space} onChange={(event) => setSpace(event.target.value)}>
            {spaces.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="比如：周末去植物园" required /></label>
        <label>分类<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>状态<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充时间、原因、链接，或者只是当时想记住的一句话" rows="4" /></label>
        <ImagePicker selectedImages={images} setSelectedImages={setImages} />
        {images.some((image) => image.status === 'failed' && image.itemId) && (
          <div className="retry-list">
            {images.filter((image) => image.status === 'failed' && image.itemId).map((image) => (
              <button type="button" className="secondary" key={image.id} onClick={() => retryImage(image)}>重试 {image.file.name}</button>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '保存中...' : '保存'}</button>
      </form>
    </Modal>
  )
}

function AttachmentGallery({ itemId }) {
  const fileRef = useRef(null)
  const [attachments, setAttachments] = useState([])
  const [newImages, setNewImages] = useState([])
  const [viewer, setViewer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const newImagesRef = useRef([])

  async function refresh() {
    setError('')
    try {
      setAttachments(await listAttachments(itemId))
    } catch (err) {
      setError(err.message || '读取图片失败')
    }
  }

  useEffect(() => { refresh() }, [itemId])

  useEffect(() => {
    newImagesRef.current = newImages
  }, [newImages])

  useEffect(() => () => {
    newImagesRef.current.forEach((image) => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl)
    })
  }, [])

  async function uploadOne(image) {
    if (!image.blob) return
    setNewImages((current) => current.map((item) => item.id === image.id ? { ...item, status: 'uploading', error: '' } : item))
    try {
      await uploadAttachment(itemId, image)
      setNewImages((current) => current.filter((item) => item.id !== image.id))
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl)
      await refresh()
    } catch (err) {
      setNewImages((current) => current.map((item) => item.id === image.id ? { ...item, status: 'failed', error: err.message || '上传失败，可重试' } : item))
    }
  }

  async function uploadPicked(files) {
    const remaining = MAX_ATTACHMENTS - attachments.length - newImages.length
    if (remaining <= 0) {
      setError('一条记录最多只能放 3 张图片。')
      return
    }
    setBusy(true)
    setError('')
    const prepared = []
    for (const file of files.slice(0, remaining)) {
      try {
        prepared.push(await compressImageFile(file))
      } catch (err) {
        prepared.push({ id: crypto.randomUUID(), file, blob: null, previewUrl: '', status: 'failed', error: err.message || '图片处理失败' })
      }
    }
    setNewImages((current) => [...current, ...prepared])
    for (const image of prepared) await uploadOne(image)
    setBusy(false)
  }

  async function removeAttachment(attachment) {
    if (!confirm('删除这张图片吗？')) return
    setBusy(true)
    setError('')
    try {
      await deleteAttachment(attachment)
      await refresh()
    } catch (err) {
      setError(err.message || '删除图片失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="attachments">
      <div className="section-heading">
        <h3>图片</h3>
        <button
          type="button"
          className="secondary"
          disabled={busy || attachments.length + newImages.length >= MAX_ATTACHMENTS}
          onClick={() => fileRef.current?.click()}
        >
          添加图片
        </button>
      </div>
      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files || [])
          event.target.value = ''
          uploadPicked(files)
        }}
      />
      <p className="hint">最多 3 张。图片只存进私人 Storage，打开时临时生成链接。</p>
      {error && <p className="error">{error}</p>}
      {(attachments.length > 0 || newImages.length > 0) && (
        <div className="image-grid">
          {attachments.map((attachment) => (
            <div className="image-tile" key={attachment.id}>
              {attachment.signedUrl
                ? <img src={attachment.signedUrl} alt={attachment.file_name || '附件图片'} onClick={() => setViewer(attachment)} />
                : <div className="image-fallback">无法预览</div>}
              <button type="button" onClick={() => removeAttachment(attachment)}>删除</button>
            </div>
          ))}
          {newImages.map((image) => (
            <div className="image-tile" key={image.id}>
              {image.previewUrl ? <img src={image.previewUrl} alt="" /> : <div className="image-fallback">失败</div>}
              {image.status === 'failed'
                ? <button type="button" onClick={() => uploadOne(image)}>重试</button>
                : <span>{image.status === 'uploading' ? '上传中...' : image.error}</span>}
            </div>
          ))}
        </div>
      )}
      {viewer && <ImageViewer attachment={viewer} onClose={() => setViewer(null)} />}
    </section>
  )
}

function ImageViewer({ attachment, onClose }) {
  return (
    <div className="image-viewer" onMouseDown={onClose}>
      <button type="button" onClick={onClose} aria-label="关闭">x</button>
      <img src={attachment.signedUrl} alt={attachment.file_name || '附件图片'} onMouseDown={(event) => event.stopPropagation()} />
    </div>
  )
}

function DetailModal({ item, onClose, onRefresh, onStatus, onSeen, onDelete }) {
  const [comments, setComments] = useState([])
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listComments(item.id).then(setComments)
  }, [item.id])

  async function submitComment(event) {
    event.preventDefault()
    if (!content.trim()) return
    setBusy(true)
    await addComment(item.id, content.trim())
    setContent('')
    setComments(await listComments(item.id))
    await onRefresh()
    setBusy(false)
  }

  return (
    <Modal title={item.title} onClose={onClose}>
      <div className="detail">
        <div className="item-topline">
          <span className="category">{getSpace(item.space).label} · {item.category}</span>
          <span className={statusClass(item.status)}>{item.status}</span>
        </div>
        {item.note && <p className="detail-note">{item.note}</p>}
        <AttachmentGallery itemId={item.id} />
        <div className="button-grid">
          <button className="secondary" onClick={() => onSeen(item.id)}>标记已看</button>
          {statuses.map((status) => <button key={status} className="ghost pill" onClick={() => onStatus(item.id, status)}>{status}</button>)}
        </div>
        <div className="meta">
          <span>更新于 {formatDate(item.updated_at)}</span>
          {item.completed_at && <span>完成于 {formatDate(item.completed_at)}</span>}
          {item.seen_at && <span>看过于 {formatDate(item.seen_at)}</span>}
        </div>
        <hr />
        <h3>留言</h3>
        <div className="comments">
          {comments.length === 0 && <p className="muted">还没有留言。</p>}
          {comments.map((comment) => (
            <div className="comment" key={comment.id}>
              <p>{comment.content}</p>
              <span>{formatDate(comment.created_at)}</span>
            </div>
          ))}
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <input value={content} onChange={(event) => setContent(event.target.value)} placeholder="写一句补充..." />
          <button className="secondary" disabled={busy}>发送</button>
        </form>
        <button className="danger" onClick={() => onDelete(item.id)}>删除这条记录</button>
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">x</button>
        </header>
        {children}
      </section>
    </div>
  )
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(<App />)
