const snabbdom = require('snabbdom');
const patch = snabbdom.init([
  require('snabbdom/modules/class'),
  require('snabbdom/modules/hero'),
  require('snabbdom/modules/style'),
  require('snabbdom/modules/eventlisteners'),
])
const h = require('snabbdom/h')
const attachTo = require('snabbdom/helpers/attachto')
const syncedDB = require('synceddb-client')

var canvas, ctx
var containerRect = {width: 0, height: 0}

const base03 = '#002b36'
const base02 = '#073642'
const base01 = '#586e75'
const base00 = '#657b83'
const base0 = '#839496'
const base1 = '#93a1a1'
const base2 = '#eee8d5'
const base3 = '#fdf6e3'
const yellow = '#b58900'
const orange = '#cb4b16'
const red = '#dc322f'
const magenta = '#d33682'
const violet = '#6c71c4'
const blue = '#268bd2'
const cyan = '#2aa198'
const green = '#859900'

const SCROLL_UNDETERMINED = 0
const SCROLL_VERTICAL = 1
const SCROLL_HORIZONTAL = 2
var scrollDirection = SCROLL_UNDETERMINED

var domRender

// Helper functions

const _ = undefined // jshint ignore:line
const noop = () => {}
const part = (fn, ...args) => (...args2) => fn.apply(_, args.concat(args2))
const pull = (elm, list) => (list.splice(list.indexOf(elm), 1), list)
const filter = (pred, list) => list.filter(pred)
const last = (arr) => arr[arr.length - 1]
const isLastOf = (elm, arr) => elm === last(arr)
const log = (name, val) => (console.log(name, val), val)
const isEven = (n) => n % 2 === 0
const concat = (l1, l2) => l1.concat(l2)
const map = (fn, list) => {
  const res = []
  for (let i = 0, l = list.length; i < l; ++i) res[i] = fn(list[i])
  return res
}
const fold = (fn, acc, list) => {
  for (let i = 0, l = list.length; i < l; ++i) acc = fn(acc, list[i])
  return acc
}
const each = (fn, list) => {
  for (let i = 0, l = list.length; i < l; ++i) fn(list[i])
}
const fromTo = (i, n) => {
  const res = []
  for (; i <= n; ++i) res[i] = i
  return res
}
const eq = (n, m) => n === m
const find = (pred, list) => {
  for (let i = 0, l = list.length; i < l; ++i) {
    if (pred(list[i])) return list[i]
  }
}
const prop = (name, obj) => obj[name]
const contains = (elm, list) => list.indexOf(elm) !== -1
const inInterval = (n, l, h) => (l <= n && n <= h)
Function.prototype.$ = function() {
  var fn = this, args = arguments
  return function() {
    var res = [], i;
    for (i = 0; i < args.length; ++i) res[i] = args[i]
    for (i = 0; i < arguments.length; ++i) res[args.length + i] = arguments[i]
    return fn.apply(undefined, res)
  }
}

// Time stuff

const millisecond = 1
const second = 1000 * millisecond
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour
const week = 7 * day
const halfWeek = week / 2

const getDate = (t) => (new Date(t)).getDate()
const getMonth = (t) => (new Date(t)).getMonth()

const now = Date.now

// Snabbdom helpers

const indentColorNames = ['yellow', 'orange', 'red', 'magenta', 'violet', 'blue', 'cyan', 'green']
const indentColors = ['#b58900', '#cb4b16', '#dc322f', '#d33682', '#6c71c4', '#268bd2', '#2aa198', '#859900']
const colorAtIndent = (n) => indentColors[isEven(n) ? n / 2 : (n - 1) / 2 + 4]

// DOM helper functions

const listen = (elm, event, cb) => elm.addEventListener(event, cb, false)
const targetValue = (ev) => ev.target.value

// Database

const stores = {
  tasks: [
    ['byParent', 'parent'],
    ['atRoot', 'atRoot'],
  ],
  sessions: [
    ['byTask', 'taskKey'],
    ['byStartTime', 'startTime']
  ]
}
const db = syncedDB.open({
  name: 'timeApp',
  version: 1,
  stores: stores,
})

const putTask = (t) => db.tasks.put(t)

let state
const defaultState = {
  newTask: _,
  timeView: {startTime: now - halfWeek, endTime: now + halfWeek},
}

const loadSessions = (node) =>
  db.sessions.byTask.get(node.task.key).then((s) => node.sessions = s)


const loadChildrenIfOpen = (node) => {
  if (node.task.open === true) {
    return db.tasks.byParent.get(node.task.key).then((children) => {
      const childrenNodes = map((t) => ({task: t, children: [], sessions: []}), children)
      node.children = childrenNodes
      return loadSessions(node)
    }).then((sessions) => Promise.all(map(loadChildrenIfOpen, node.children)))
  } else {
    return loadSessions(node)
  }
}

const initializeState = () => {
  const restoredState = localStorage.getItem('state')
  const state = restoredState !== null ? JSON.parse(restoredState) : defaultState
  return db.tasks.atRoot.getAll().then((rootTasks) => {
    const rootNodes = map((t) => ({task: t, children: [], sessions: []}), rootTasks)
    state.taskTree = rootNodes
    return Promise.all(map(loadChildrenIfOpen, rootNodes))
  }).then(() => state)
}

// Canvas rendering

const renderSessions = (ctx, msSize, startTime, endTime, offset, node) => {
  const {task, sessions, children} = node
  for (let s of sessions) {
    if (inInterval(s.startTime, startTime, endTime) ||
        inInterval(s.endTime, startTime, endTime)) {
      ctx.fillRect((s.startTime - startTime) * msSize, offset * 52 + 24,
                   (s.endTime - s.startTime) * msSize, 51)
    }
  }
  return task.open === true ? fold(renderSessions.$(ctx, msSize, startTime, endTime), offset + 1, children)
                            : offset + 1
}

const render = (canvas, ctx) => {
  const w = canvas.width
  const h = canvas.height
  if (containerRect.width !== w || containerRect.height !== h) {
    resizeCanvas(canvas, containerRect)
  } else {
    ctx.clearRect(0, 0, w, h)
  }
  ctx.fillStyle = base2
  ctx.fillRect(0, 0, w, 24)
  ctx.fillStyle = base1
  const msSize = containerRect.width / (state.timeView.endTime - state.timeView.startTime)
  const daysVisible = Math.ceil((state.timeView.endTime - state.timeView.startTime) / day) + 1
  const daySize = containerRect.width / ((state.timeView.endTime - state.timeView.startTime) / day)
  const startTime = state.timeView.startTime - (state.timeView.startTime % day)
  const offset = (state.timeView.startTime % day) / day * daySize
  for (let i = 0; i < daysVisible; ++i) {
    ctx.fillStyle = base1
    ctx.fillRect(-offset + i * daySize, 0, 1, 24)
    ctx.fillStyle = base2
    ctx.fillRect(-offset + i * daySize, 24, 1, h-24)
  }
  ctx.fillStyle = base00
  for (let i = 0; i < daysVisible; ++i) {
    let t = startTime + (i * day)
    ctx.fillText(getDate(t) + ' / ' + getMonth(t), -offset + i * daySize + 5, 15)
  }
  fold(renderSessions.$(ctx, msSize, state.timeView.startTime, state.timeView.endTime), 0, state.taskTree)
}

const resizeCanvas = (canvas, {width: w, height: h}) => {
  canvas.width = w * window.devicePixelRatio
  canvas.height = h * window.devicePixelRatio
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
}

listen(document, 'DOMContentLoaded', () => {
  initializeState().then((initState) => {
    console.log('state inited')
    console.log(initState)
    state = initState
    domRender = domRenderer()
    domRender()
    setTimeout(() => updateContainerRect(canvas, ctx), 200)

    canvas = document.getElementById('canvas')
    ctx = canvas.getContext('2d')

    const content = document.getElementById('task-container')
    listen(content, 'resize', updateContainerRect)
    listen(content, 'touchstart', touchStart)
    listen(content, 'touchend', touchEnd)
    listen(content, 'touchcancel', touchCancel)
    listen(content, 'touchmove', touchMove)

    requestAnimationFrame(function frame() {
      render(canvas, ctx)
      requestAnimationFrame(frame)
    })
  })
})

const updateContainerRect = () => {
  const rect = document.getElementById('task-container').getBoundingClientRect()
  containerRect.width = rect.width | 0
  containerRect.height = rect.height | 0
}

// Handle gestures

var touchesDown = []

const touchStart = (ev) => {
  scrollDirection = SCROLL_UNDETERMINED
  const touch = ev.changedTouches[0];
  touchesDown = concat(touchesDown, map((t) => ({id: t.identifier, x: t.pageX, y: t.pageY}), ev.changedTouches))
}

const touchEnd = (ev) => {
  const ids = map(prop.$('identifier'), ev.changedTouches)
  touchesDown = filter((t) => !contains(t.id, ids), touchesDown)
}

const touchCancel = (ev) => {
  const ids = map(prop.$('identifier'), ev.changedTouches)
  touchesDown = filter((t) => !contains(t.id, ids), touchesDown)
}

const touchMove = (ev) => {
  if (touchesDown.length === 1) {
    const t = touchesDown[0]
    const moved = find((moved) => moved.identifier === t.id, ev.changedTouches)
    if (moved !== _) {
      const x = moved.pageX
      const y = moved.pageY
      if (scrollDirection === SCROLL_UNDETERMINED) {
        if (Math.abs(x - t.x) > 30) {
          ev.preventDefault()
          scrollDirection = SCROLL_HORIZONTAL
          t.x = x
          t.y = y
        } else if (Math.abs(y - t.y) > 30) {
          scrollDirection = SCROLL_VERTICAL
        }
      } else if (scrollDirection === SCROLL_HORIZONTAL) {
        ev.preventDefault()
        const pixelSize = (state.timeView.endTime - state.timeView.startTime) / containerRect.width
        state.timeView.startTime -= (x - t.x) * pixelSize
        state.timeView.endTime -= (x - t.x) * pixelSize
        t.x = x
        t.y = y
      }
    }
  } else {
    const t1 = touchesDown[0], t2 = touchesDown[1]
    const m1 = find((t) => t.identifier === t1.id, ev.touches)
    const m2 = find((t) => t.identifier === t2.id, ev.touches)
    const nRelX1 = m1.screenX / containerRect.width
    const nRelX2 = m2.screenX / containerRect.width
    const timeViewDur = state.timeView.endTime - state.timeView.startTime
    const time1 = state.timeView.startTime + (t1.x / containerRect.width) * timeViewDur
    const time2 = state.timeView.startTime + (t2.x / containerRect.width) * timeViewDur
    const durPerWidth = Math.abs(time1 - time2) / Math.abs(nRelX1 - nRelX2)
    state.timeView.startTime = time1 - durPerWidth * nRelX1
    state.timeView.endTime = time1 + durPerWidth * (1 - nRelX1)
    t1.x = m1.screenX
    t1.y = m1.screenY
    t2.x = m2.screenX
    t2.y = m2.screenY
  }
}

// Modify state

const toggleFold = (node) => {
  const task = node.task
  task.open = !task.open
  putTask(task).then(() => loadChildrenIfOpen(node)).then(() => {
    domRender()
    updateContainerRect()
  })
}

const toggleDone = (task) => {
  task.done = !task.done
  putTask(task)
  domRender()
}

const toggleTimerModal = (task, ev) => {
  task.timerModalOpen = !task.timerModalOpen
  domRender()
}

const startTimer = (node, duration) => {
  const startTime = now()
  const session = {
    taskKey: node.task.key,
    startTime,
    endTime: duration === _ ? 0 : startTime + duration
  }
  state.activeSession = {session, node}
  node.task.timerModalOpen = false
  db.sessions.put(session)
  domRender()
}

const endSession = (session, sessions) => {
  //if (session.endTime === 0) session.endTime = now()
  if (session.endTime === 0) session.endTime = (now() - session.startTime) * second + now()
  db.sessions.put(session).then(() => {
    state.activeSession = _
    sessions.push(session)
    domRender()
  })
}

const toggleOptionsMenu = (task) => {
  task.showOptionsMenu = !task.showOptionsMenu
  domRender()
}

const beginCreateTask = (parent, target) => {
  console.log('begin create task', parent)
  if (parent !== _) {
    parent.showOptionsMenu = false
    parent.open = true
    putTask(parent)
  }
  state.newTask = {title: '', target, parent}
  domRender()
}

const dropNewTask = () => {
  state.newTask = _
  domRender()
}

const updateNewSubtaskTitle = (task, ev) => {
  state.newTask.title = targetValue(ev)
}

const createNewTask = ({parent, target, title}, ev) => {
  ev.preventDefault()
  const createdTask = {title, open: false}
  console.log(target)
  if (parent === _) {
    createdTask.atRoot = 1
  } else {
    createdTask.parent = parent.key
    if (parent.hasSubtasks !== true) {
      parent.hasSubtasks = true
      putTask(parent)
    }
  }
  target.push({task: createdTask, children: [], sessions: []})
  state.newTask = _
  putTask(createdTask)
  domRender()
  updateContainerRect()
}

const deleteTask = (node, parentChildren) => {
  node.task.showOptionsMenu = _
  domRender()
  pull(node, parentChildren)
  domRender()
  updateContainerRect()
  db.tasks.delete(node.task.key)
}

// View

const startSessionModal = (node) =>
  h('div.begin-session', [
    h('div.btn.btn-block', {on: {click: [startTimer, node, _]}}, 'Stop timer manually'),
    h('h2', 'or after'),
    h('table', [
      h('tr', [
        h('td.btn', '10s'),
        h('td.btn', '5m'),
        h('td.btn', '10m'),
      ]),
      h('tr', [
        h('td.btn', '15m'),
        h('td.btn', '20m'),
        h('td.btn', '25m'),
      ]),
      h('tr', [
        h('td.btn', '30m'),
        h('td.btn', '35m'),
        h('td.btn', '40m'),
      ]),
      h('tr', [
        h('td.btn', '45m'),
        h('td.btn', '50m'),
        h('td.btn', '55m'),
      ]),
      h('tr', [
        h('td.btn', '1h'),
        h('td.btn', '1h 15m'),
        h('td.btn', '1h 30m'),
      ]),
    ]),
  ])

const sessionModal = ({session, node}) =>
  h('div', [
    'Session started!', h('br'),
    session.startTime, h('br'),
    session.endTime || 'never ends',
    h('div.btn', {on: {click: [endSession, session, node.sessions]}}, 'End'),
  ])

const createTaskModal = (newTask) =>
  h('div', [
    h('h2', 'Create subtask'),
    h('form', {on: {submit: createNewTask.$(newTask)}}, [
        h('input', {on: {input: updateNewSubtaskTitle.$(newTask)}})
    ])
  ])

const taskOptionsModal = (parentChildren, node) =>
  h('div', {style: {}}, [
    h('div.btn.btn-block', {style: {marginBottom: '.5em'}, on: {click: [beginCreateTask, node.task, node.children]}}, 'Create subtask'),
    h('div.btn.btn-block.btn-danger', {on: {click: [deleteTask, node, parentChildren]}}, 'Delete task'),
  ])

const foldIndicator = (node) =>
  h('div.fold-indicator', {
    on: {click: [toggleFold, node]},
  }, [h('i.fa.fa-chevron-right', {
    style: {transform: `rotate(${node.task.open ? 90 : 0}deg)`},
  })])

const doneCheckbox = (task) =>
  h('div.fold-indicator', {
    on: {click: [toggleDone, task]},
  }, [task.done ? h('i.fa.fa-check-square') : h('i.fa.fa-square-o')])

const vtask = (parentChildren, level, node) => {
  const {task, children} = node
  const isLast = parentChildren && isLastOf(node, parentChildren)
  const indentationChange = task.open || isLast
  return h('li.task', {
    class: {folded: !task.open},
  }, [
    h('div.task-line', {
      style: {opacity: 0, transform: 'translateY(0px)',
              delayed: {opacity: 1, transform: 'translateY(0px)'}},
    },
    map((l) => h('div.indent-indicator', {
      class: {'indent-faded': l !== level},
      style: {marginLeft: `${l}em`, backgroundColor: colorAtIndent(l)}
    }), fromTo(0, level)).concat([
      task.hasSubtasks ? foldIndicator(node) : doneCheckbox(task),
      h('div.title-container', {
        on: {click: [toggleOptionsMenu, task]},
      }, [h('span.title', {
        class: {done: task.done},
        style: {color: !task.done ? colorAtIndent(level) : base1}
      }, task.title)]),
      h('div.start-timing-btn', {on: {click: [toggleTimerModal, task]}}, [h('i.fa.fa-lg.fa-clock-o')]),
    ])),
    task.open ? h('ul', {style: {borderRadius: '0px'}}, map(vtask.$(children, level + 1), children)) : '',
    task.timerModalOpen ? modal(startSessionModal(node), toggleTimerModal.$(task)) : '',
    task.showOptionsMenu ? modal(taskOptionsModal(parentChildren, node), toggleOptionsMenu.$(task)) : '',
  ])
}

const vtree = (state) =>
  h('div#container', [
    h('div.top-bar', [
      h('div.app-name', 'Timesheet'),
      h('i.menu-btn.fa.fa-ellipsis-v'),
    ]),
    h('div.top-bar-filler'),
    h('canvas#canvas'),
    h('div#task-container', [
      h('ul#tasks', map(vtask.$(state.taskTree, 0), state.taskTree)),
      h('div.btn', {style: {margin: '.2em'}, on: {click: [beginCreateTask, _, state.taskTree]}}, 'Create task'),
      state.newTask ? modal(createTaskModal(state.newTask), dropNewTask) : '',
      state.activeSession ? modal(sessionModal(state.activeSession), noop) : '',
    ])
  ])

const domRenderer = () => {
  var oldVtree = document.getElementById('container')
  return () => {
    if (state.timeView === _) {
      state.timeView = {startTime: now() - halfWeek, endTime: now() + halfWeek}
    }
    oldVtree = patch(oldVtree, vtree(state))
    localStorage.setItem('state', JSON.stringify(state))
  }
}

const modal = (vnode, rmCb) => attachTo(document.body, h('div.modal', {
    style: {opacity: 0, delayed: {opacity: 1}, remove: {opacity: 0}},
  }, [
    h('div.modal-backdrop', {
      on: {click: rmCb},
    }),
    vnode
  ]))
