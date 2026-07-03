// A tiny in-memory "database" standing in for the Django API during frontend-first
// development. Persists to localStorage so state survives reloads. Every function
// here is async and simulates network latency so swapping in real axios calls
// later (see src/api/*.js) doesn't change call sites.
import * as seed from './seed'

const STORAGE_KEY = 'lms-mock-db-v11'

const collections = [
  'users', 'companies', 'contacts', 'leadTypes', 'taskSteps', 'checklistTemplateItems', 'taskStepFields',
  'leadTypeCustomFields', 'leads', 'leadTasks', 'leadChecklistItems', 'leadTaskFields',
  'leadCustomValues', 'attachments', 'activities', 'followups', 'notifications',
]

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fall through to seed
  }
  const state = {}
  for (const key of collections) state[key] = structuredClone(seed[key])
  return state
}

let state = loadInitialState()

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const LATENCY_MS = 150

export function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let nextIdCounter = 1000
export function genId(prefix) {
  nextIdCounter += 1
  return `${prefix}-${nextIdCounter}`
}

export async function getAll(collection) {
  await delay()
  return structuredClone(state[collection])
}

export async function getById(collection, id) {
  await delay()
  const row = state[collection].find((r) => r.id === id)
  return row ? structuredClone(row) : null
}

export async function insert(collection, row) {
  await delay()
  state[collection] = [...state[collection], row]
  persist()
  return structuredClone(row)
}

export async function update(collection, id, patch) {
  await delay()
  let updated = null
  state[collection] = state[collection].map((r) => {
    if (r.id === id) {
      updated = { ...r, ...patch }
      return updated
    }
    return r
  })
  persist()
  return updated ? structuredClone(updated) : null
}

export async function remove(collection, id) {
  await delay()
  state[collection] = state[collection].filter((r) => r.id !== id)
  persist()
}

export function resetToSeed() {
  const fresh = {}
  for (const key of collections) fresh[key] = structuredClone(seed[key])
  state = fresh
  persist()
}

// Synchronous, no-latency accessor for read-heavy derived lookups within the mock layer.
export function peek(collection) {
  return state[collection]
}
