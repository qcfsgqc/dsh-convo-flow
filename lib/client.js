const MODE_KEY = 'dsh-convo-flow:mode'
const SCOPE_KEY = 'dsh-convo-flow:scope'

let runtime = null
let overlay = null

export const name = 'convo-flow'
export const inject = ['slots']

export function apply(ctx) {
  runtime = ctx
  const tryMount = () => mount(ctx)
  if (!tryMount()) {
    const timers = [300, 1200, 2500].map((ms) => setTimeout(tryMount, ms))
    ctx.on?.('dispose', () => timers.forEach(clearTimeout))
  }
}

function mount(ctx) {
  const slots = ctx.slots || ctx.get?.('slots')
  if (!slots || typeof slots.register !== 'function') return false
  if (mount.done) return true
  mount.done = true

  slots.register({
    name: 'conversation.view',
    children: [{
      id: 'convo-flow',
      key: 'convo-flow',
      title: '工作流',
      label: '工作流',
      order: 36,
      Component: (props) => view(props, 'lineage'),
      component: (props) => view(props, 'lineage'),
    }],
  })

  slots.register({
    name: 'sidebar.footer.action',
    children: [{
      id: 'convo-flow-all',
      key: 'convo-flow-all',
      title: '全机工作流',
      label: '全机工作流',
      order: 70,
      onClick: () => openBoard('all'),
      Component: AllButton,
      component: AllButton,
    }],
  })
  return true
}

function AllButton() {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = '全机工作流'
  el.title = '全部工作区的会话血缘'
  el.style.cssText = 'appearance:none;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0;'
  el.addEventListener('click', () => openBoard('all'))
  return el
}

function view(props, entry) {
  const host = document.createElement('div')
  host.className = 'dcf-root'
  host.style.cssText = 'height:100%;min-height:0;'
  const paint = () => {
    host.replaceChildren(board({
      entry,
      sessionId: props?.sessionId || props?.session?.id,
      embedded: true,
    }))
  }
  paint()
  const off = subscribe(paint)
  return {
    element: host,
    destroy() { off() },
  }
}

function openBoard(entry) {
  closeBoard()
  overlay = document.createElement('div')
  overlay.setAttribute('data-dcf-overlay', '')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(6,7,10,.62);display:flex;align-items:stretch;justify-content:center;padding:28px;'
  const frame = document.createElement('div')
  frame.style.cssText = 'flex:1;max-width:1280px;min-height:0;background:#101114;border:1px solid #2a2d34;border-radius:16px;overflow:hidden;display:flex;'
  const inner = board({ entry, sessionId: currentSessionId(), embedded: false })
  frame.append(inner)
  overlay.append(frame)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeBoard()
  })
  document.body.append(overlay)
}

function closeBoard() {
  overlay?.remove()
  overlay = null
}

function board({ entry, sessionId, embedded }) {
  const root = document.createElement('section')
  root.className = 'dcf-board'
  root.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;min-height:420px;background:#101114;color:#ece8e1;font:13px/1.45 ui-sans-serif,system-ui,sans-serif;'
  const style = document.createElement('style')
  style.textContent = css()
  root.append(style)

  const state = {
    mode: readMode(),
    scope: entry === 'all' ? 'all' : (localStorage.getItem(SCOPE_KEY) || 'lineage'),
    workspace: 'all',
    sessionId,
  }

  const bar = document.createElement('header')
  bar.className = 'dcf-bar'
  const canvas = document.createElement('div')
  canvas.className = 'dcf-canvas'
  root.append(bar, canvas)

  const paint = () => {
    const sessions = readSessions()
    bar.replaceChildren(toolbar(state, sessions, embedded, paint))
    canvas.replaceChildren(canvasView(state, sessions))
  }
  paint()
  const off = subscribe(paint)
  root.addEventListener('dcf-destroy', off, { once: true })
  return root
}

function toolbar(state, sessions, embedded, paint) {
  const bar = document.createElement('div')
  bar.className = 'dcf-bar-inner'
  const title = document.createElement('div')
  title.className = 'dcf-title'
  title.innerHTML = '<strong>对话工作流</strong><span>一个会话一个节点</span>'

  const scopes = seg(state.scope, [
    ['lineage', '当前血缘'],
    ['all', '全部工作区'],
  ], (value) => {
    state.scope = value
    localStorage.setItem(SCOPE_KEY, value)
    paint()
  })
  const modes = seg(state.mode, [
    ['simple', '简洁'],
    ['detail', '详细'],
  ], (value) => {
    state.mode = value
    localStorage.setItem(MODE_KEY, value)
    paint()
  })

  const filter = document.createElement('select')
  filter.className = 'dcf-select'
  const names = ['all', ...new Set(sessions.map((item) => item.workspace))]
  for (const name of names) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name === 'all' ? '全部工作区' : name
    if (name === state.workspace) option.selected = true
    filter.append(option)
  }
  filter.addEventListener('change', () => {
    state.workspace = filter.value
    paint()
  })

  const count = document.createElement('span')
  count.className = 'dcf-count'
  count.textContent = `${visible(state, sessions).length} 个会话`

  bar.append(title, scopes, modes, filter, count)
  if (!embedded) {
    const close = document.createElement('button')
    close.className = 'dcf-close'
    close.type = 'button'
    close.textContent = '关闭'
    close.addEventListener('click', closeBoard)
    bar.append(close)
  }
  return bar
}

function canvasView(state, sessions) {
  const wrap = document.createElement('div')
  wrap.className = 'dcf-scroll'
  const rows = visible(state, sessions)
  if (!rows.length) {
    const empty = document.createElement('p')
    empty.className = 'dcf-empty'
    empty.textContent = sessions.length
      ? '这个范围里没有会话。'
      : '还没读到会话列表。打开一条对话后再看；插件只读 DSH 现成血缘，不另建库。'
    wrap.append(empty)
    return wrap
  }
  for (const forest of forests(rows)) {
    wrap.append(forestView(forest, state.mode))
  }
  return wrap
}

function forestView(nodes, mode) {
  const block = document.createElement('div')
  block.className = 'dcf-forest'
  const label = document.createElement('div')
  label.className = 'dcf-workspace'
  label.textContent = nodes[0]?.workspace || '未分组'
  const stage = document.createElement('div')
  stage.className = 'dcf-stage'
  const laid = layout(nodes, mode)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'dcf-edges')
  svg.setAttribute('width', String(laid.width))
  svg.setAttribute('height', String(laid.height))
  for (const edge of laid.edges) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', edge.d)
    path.setAttribute('class', 'dcf-edge')
    svg.append(path)
  }
  stage.append(svg)
  stage.style.width = `${laid.width}px`
  stage.style.height = `${laid.height}px`
  for (const node of laid.nodes) {
    stage.append(card(node, mode))
  }
  block.append(label, stage)
  return block
}

function card(node, mode) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `dcf-node dcf-${node.status} dcf-${mode}`
  el.style.left = `${node.x}px`
  el.style.top = `${node.y}px`
  el.style.width = `${node.w}px`
  const head = document.createElement('div')
  head.className = 'dcf-head'
  const dot = document.createElement('i')
  dot.className = 'dcf-dot'
  const name = document.createElement('b')
  name.textContent = node.title
  const role = document.createElement('em')
  role.textContent = node.depth === 0 ? '父会话' : `子代理 · L${node.depth}`
  head.append(dot, name, role)
  el.append(head)
  if (mode === 'detail') {
    const meta = document.createElement('div')
    meta.className = 'dcf-meta'
    meta.textContent = [node.model || '模型未报', node.usage].filter(Boolean).join(' · ')
    const user = quote('用户', node.lastUser)
    const reply = quote('回复', node.lastAssistant)
    el.append(meta, user, reply)
  }
  el.addEventListener('click', () => openSession(node))
  return el
}

function quote(label, text) {
  const row = document.createElement('p')
  row.className = 'dcf-quote'
  const mark = document.createElement('span')
  mark.textContent = label
  row.append(mark, document.createTextNode(text || '这条会话还没有可读回合'))
  return row
}

function openSession(node) {
  const ctx = runtime
  const sessions = ctx?.sessions || ctx?.get?.('sessions')
  const parentId = node.parentId
  try {
    if (parentId && typeof sessions?.openSubagent === 'function') {
      sessions.openSubagent({ parentSessionId: parentId, childSessionId: node.id, mode: node.mode || 'background' })
      return
    }
    if (typeof sessions?.open === 'function') {
      sessions.open(node.id)
      return
    }
    ctx?.uiWorkspace?.openSession?.(node.id)
  } catch (error) {
    console.warn('[dsh-convo-flow] open session failed', error)
  }
}

function visible(state, sessions) {
  const filtered = state.workspace === 'all'
    ? sessions
    : sessions.filter((item) => item.workspace === state.workspace)
  if (state.scope !== 'lineage') return filtered
  const focus = state.sessionId || currentSessionId()
  if (!focus) return filtered.slice(0, 1)
  const byId = new Map(filtered.map((item) => [item.id, item]))
  let root = byId.get(focus)
  const guard = new Set()
  while (root?.parentId && byId.has(root.parentId) && !guard.has(root.id)) {
    guard.add(root.id)
    root = byId.get(root.parentId)
  }
  if (!root) return []
  const keep = new Set()
  const walk = (id) => {
    if (keep.has(id)) return
    keep.add(id)
    for (const item of filtered) if (item.parentId === id) walk(item.id)
  }
  walk(root.id)
  return filtered.filter((item) => keep.has(item.id))
}

function forests(sessions) {
  const groups = new Map()
  for (const item of sessions) {
    const key = item.workspace || '未分组'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.values()]
}

function layout(nodes, mode) {
  const w = mode === 'detail' ? 280 : 196
  const h = mode === 'detail' ? 168 : 64
  const gapX = 28
  const gapY = mode === 'detail' ? 72 : 56
  const byParent = new Map()
  const ids = new Set(nodes.map((item) => item.id))
  for (const item of nodes) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent).push(item)
  }
  const depth = new Map()
  const walk = (id, level) => {
    depth.set(id, level)
    for (const child of byParent.get(id) || []) walk(child.id, level + 1)
  }
  for (const root of byParent.get(null) || []) walk(root.id, 0)
  const levels = new Map()
  for (const item of nodes) {
    const level = depth.get(item.id) || 0
    if (!levels.has(level)) levels.set(level, [])
    levels.get(level).push(item)
  }
  const placed = []
  let width = 0
  let height = 24
  for (const level of [...levels.keys()].sort((a, b) => a - b)) {
    const row = levels.get(level)
    const rowWidth = row.length * w + (row.length - 1) * gapX
    width = Math.max(width, rowWidth)
    row.forEach((item, index) => {
      placed.push({ ...item, depth: level, x: 24 + index * (w + gapX), y: 24 + level * (h + gapY), w, h })
    })
    height = 24 + level * (h + gapY) + h + 24
  }
  width += 48
  const byId = new Map(placed.map((item) => [item.id, item]))
  const edges = []
  for (const item of placed) {
    const parent = byId.get(item.parentId)
    if (!parent) continue
    const x1 = parent.x + parent.w / 2
    const y1 = parent.y + parent.h
    const x2 = item.x + item.w / 2
    const y2 = item.y
    const mid = (y1 + y2) / 2
    edges.push({ d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}` })
  }
  return { nodes: placed, edges, width: Math.max(width, 360), height }
}

function readSessions() {
  const ctx = runtime
  const service = ctx?.sessions || ctx?.get?.('sessions')
  const snap = service?.list?.getSnapshot?.() || service?.list?.() || service?.snapshot?.() || []
  const list = Array.isArray(snap) ? snap : (snap.items || snap.sessions || snap.byId && Object.values(snap.byId) || [])
  return list.map(normalize).filter((item) => item.id)
}

function normalize(raw) {
  const id = raw.id || raw.sessionId
  const parent = raw.parentSession || raw.parent
  return {
    id,
    parentId: raw.parentId || raw.parentSessionId || parent?.id || null,
    origin: raw.origin || '',
    title: raw.title || raw.name || short(id),
    workspace: raw.workspaceName || raw.workspace || raw.project || raw.cwd || '未分组',
    status: raw.running || raw.status === 'running' ? 'running' : (raw.status === 'failed' || raw.error ? 'failed' : 'idle'),
    model: raw.model || raw.lastModel || '',
    usage: formatUsage(raw.usage || raw.tokens),
    lastUser: text(raw.lastUser || raw.lastUserMessage),
    lastAssistant: text(raw.lastAssistant || raw.lastMessage || raw.preview),
    mode: raw.mode,
  }
}

function formatUsage(usage) {
  if (!usage) return ''
  if (typeof usage === 'string') return usage
  const input = usage.input ?? usage.prompt
  const output = usage.output ?? usage.completion
  if (input == null && output == null) return ''
  return `↑ ${input ?? '–'} / ↓ ${output ?? '–'}`
}

function text(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 180)
  return String(value.content || value.text || '').slice(0, 180)
}

function short(id) {
  return id ? String(id).slice(0, 8) : '未命名'
}

function currentSessionId() {
  const ctx = runtime
  return ctx?.sessions?.currentId || ctx?.get?.('sessions')?.currentId || null
}

function subscribe(paint) {
  const ctx = runtime
  const service = ctx?.sessions || ctx?.get?.('sessions')
  const unsubs = []
  if (typeof service?.list?.subscribe === 'function') unsubs.push(service.list.subscribe(paint))
  if (typeof ctx?.on === 'function') unsubs.push(ctx.on('session-changed', paint))
  const timer = setInterval(paint, 4000)
  return () => {
    unsubs.forEach((off) => { try { off?.() } catch { /* ignore */ } })
    clearInterval(timer)
  }
}

function readMode() {
  return localStorage.getItem(MODE_KEY) === 'detail' ? 'detail' : 'simple'
}

function seg(current, options, onChange) {
  const wrap = document.createElement('div')
  wrap.className = 'dcf-seg'
  for (const [value, label] of options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    if (value === current) button.className = 'is-on'
    button.addEventListener('click', () => onChange(value))
    wrap.append(button)
  }
  return wrap
}

function css() {
  return `
    .dcf-bar-inner{display:flex;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #2a2d34;flex-wrap:wrap}
    .dcf-title{display:flex;flex-direction:column;margin-right:8px}
    .dcf-title strong{font-size:14px}
    .dcf-title span,.dcf-count{color:#9a9388;font-size:12px}
    .dcf-seg{display:flex;border:1px solid #343841;border-radius:999px;overflow:hidden}
    .dcf-seg button,.dcf-close,.dcf-select{background:#181a1f;color:#ece8e1;border:0;padding:6px 10px;cursor:pointer}
    .dcf-seg button.is-on{background:#efe7d6;color:#1b1916}
    .dcf-select{border:1px solid #343841;border-radius:8px}
    .dcf-close{border:1px solid #343841;border-radius:8px;margin-left:auto}
    .dcf-scroll{flex:1;overflow:auto;padding:18px}
    .dcf-forest{margin-bottom:22px}
    .dcf-workspace{color:#9a9388;font-size:12px;margin:0 0 8px}
    .dcf-stage{position:relative}
    .dcf-edges{position:absolute;inset:0;pointer-events:none}
    .dcf-edge{fill:none;stroke:#8d867c;stroke-width:1.4}
    .dcf-node{position:absolute;text-align:left;border:1px solid #343841;background:#17191e;color:#ece8e1;border-radius:12px;padding:10px 12px;cursor:pointer}
    .dcf-node:hover{border-color:#efe7d6}
    .dcf-head{display:flex;gap:8px;align-items:center}
    .dcf-head b{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dcf-head em{color:#9a9388;font-style:normal;font-size:11px}
    .dcf-dot{width:8px;height:8px;border-radius:99px;background:#8d867c;display:block}
    .dcf-running .dcf-dot{background:#7dcea0}
    .dcf-failed .dcf-dot{background:#e07a6a}
    .dcf-meta{color:#b7b1a6;font-size:12px;margin-top:8px}
    .dcf-quote{margin:8px 0 0;color:#d9d3c9;font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .dcf-quote span{color:#9a9388;margin-right:6px}
    .dcf-empty{color:#9a9388;padding:24px}
  `
}
