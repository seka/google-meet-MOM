import type { Recording } from './types'

const DB_NAME = 'google-meet-mom'
const DB_VERSION = 1
const STORE_NAME = 'recordings'

let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('date', 'date', { unique: false })
      }
    }

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result
      resolve(dbInstance)
    }

    request.onerror = () => reject(request.error)
  })
}

export async function saveRecording(data: Omit<Recording, 'id'>): Promise<string> {
  const db = await openDB()
  const id = crypto.randomUUID()
  const record: Recording = { ...data, id }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add(record)
    req.onsuccess = () => resolve(id)
    req.onerror = () => reject(req.error)
  })
}

export async function updateRecording(id: string, updates: Partial<Recording>): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(id)

    getReq.onsuccess = () => {
      const record = { ...getReq.result, ...updates }
      const putReq = store.put(record)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }

    getReq.onerror = () => reject(getReq.error)
  })
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result as Recording | undefined)
    req.onerror = () => reject(req.error)
  })
}
