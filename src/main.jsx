import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  addComment,
  addItem,
  deleteItem,
  getSession,
  hasSupabaseConfig,
  listComments,
  listItems,
  markSeen,
  signIn,
  signOut,
  signUp,
  updateItem,
} from './storage'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Remember You'

const categories = ['想一起做', '重要日子', '礼物灵感', '需要聊聊', '生活待办']
const statuses = ['新想法', '待确认', '本周行动', '已完成', '先搁置']

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusClass(status) {
  return `status status-${status.replaceAll(' ', '-')}`
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    getSession().then(setSession).finally(() => setAuthLoading(false))
  }, [])

  if (authLoading) return <Shell><p className="muted">正在打开记忆本...</p></Shell>

  if (!session && hasSupabaseConfig) {
    return <AuthScreen onAuthed={(nextSession) => setSession(nextSession)} />
  }

  return <Notebook session={session} onLogout={() => signOut().then(() => setSession(null))} />
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
        <div className="eyebrow">两个人的轻量记忆本</div>
        <h1>{APP_NAME}</h1>
        <p>记录想一起做的事、重要日期、礼物灵感和需要慢慢聊清楚的小事。</p>
      </section>
      <form className="card form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>登录</button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>注册</button>
        </div>
        {mode === 'signup' && (
          <label>
            昵称
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="怎么称呼你" />
          </label>
        )}
        <label>
          邮箱
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </label>
        <label>
          密码
          <input type="password" minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '处理中...' : mode === 'signin' ? '进入记忆本' : '创建账号'}</button>
        <p className="hint">接入 Supabase 后会使用真实账号；未配置时会自动进入本地预览模式。</p>
      </form>
    </Shell>
  )
}

function Notebook({ onLogout }) {
  const [items, setItems] = useState([])
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

  const filtered = useMemo(() => items.filter((item) => {
    const categoryOk = selectedCategory === '全部' || item.category === selectedCategory
    const statusOk = selectedStatus === '全部' || item.status === selectedStatus
    return categoryOk && statusOk
  }), [items, selectedCategory, selectedStatus])

  const stats = useMemo(() => ({
    total: items.length,
    done: items.filter((item) => item.status === '已完成').length,
    pending: items.filter((item) => item.status === '待确认').length,
    week: items.filter((item) => item.status === '本周行动').length,
  }), [items])

  async function handleStatus(id, status) {
    await updateItem(id, { status })
    await refresh()
  }

  async function handleSeen(id) {
    await markSeen(id)
    await refresh()
  }

  async function handleDelete(id) {
    if (!confirm('确定删除这条记录吗？')) return
    await deleteItem(id)
    setDetailItem(null)
    await refresh()
  }

  return (
    <Shell>
      <header className="topbar">
        <div>
          <div className="eyebrow">两个人的轻量记忆本</div>
          <h1>{APP_NAME}</h1>
        </div>
        {hasSupabaseConfig && <button className="ghost" onClick={onLogout}>退出</button>}
      </header>

      {!hasSupabaseConfig && (
        <div className="notice">当前是本地预览模式：数据只保存在此浏览器。配置 Supabase 后可同步到云端并开启登录。</div>
      )}

      <section className="hero">
        <p>把“以后再说”的小事放到一个柔软但靠谱的地方。先记下来，之后一起决定要不要做、什么时候做。</p>
        <button className="primary big" onClick={() => setShowNew(true)}>新增一条记录</button>
      </section>

      <section className="stats-grid">
        <Stat label="总数" value={stats.total} />
        <Stat label="已完成" value={stats.done} />
        <Stat label="待确认" value={stats.pending} />
        <Stat label="本周行动" value={stats.week} />
      </section>

      <section className="filters">
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
          <option>全部</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
          <option>全部</option>
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </section>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">正在读取...</p> : (
        <section className="list">
          {filtered.length === 0 && <EmptyState onAdd={() => setShowNew(true)} />}
          {filtered.map((item) => (
            <article className="item-card" key={item.id} onClick={() => setDetailItem(item)}>
              <div className="item-topline">
                <span className="category">{item.category}</span>
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

      <section className="weekly card">
        <h2>本周关注</h2>
        <p>把需要回应的事收在这里，避免它们散落在聊天记录里。</p>
        <div className="mini-row">
          <span>待确认和本周行动</span>
          <strong>{stats.pending + stats.week} 条</strong>
        </div>
      </section>

      {showNew && <NewItemModal onClose={() => setShowNew(false)} onCreated={async () => { setShowNew(false); await refresh() }} />}
      {detailItem && <DetailModal item={detailItem} onClose={() => setDetailItem(null)} onRefresh={refresh} onStatus={handleStatus} onSeen={handleSeen} onDelete={handleDelete} />}
    </Shell>
  )
}

function Stat({ label, value }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>
}

function EmptyState({ onAdd }) {
  return (
    <div className="empty card">
      <h2>还没有记录</h2>
      <p>先放进一条想法，哪怕它还很小。</p>
      <button className="secondary" onClick={onAdd}>新增记录</button>
    </div>
  )
}

function NewItemModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [status, setStatus] = useState(statuses[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await addItem({ title, category, status, note })
      onCreated()
    } catch (err) {
      setError(err.message || '新增失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="新增记录" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>标题<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="比如：周末去植物园" required /></label>
        <label>分类<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>状态<select value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>备注<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="补充时间、原因、链接或任何想记住的细节" rows="4" /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '保存中...' : '保存'}</button>
      </form>
    </Modal>
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
          <span className="category">{item.category}</span>
          <span className={statusClass(item.status)}>{item.status}</span>
        </div>
        {item.note && <p className="detail-note">{item.note}</p>}
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
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="写一句补充..." />
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
      <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
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
