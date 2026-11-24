// IndexedDB 封装：projects / assets / variants 三个对象仓，键值统一字符串 id

import type { AssetRecord, LineworkVariant, StampProject, StoreName } from '@/types'

const DB_NAME = 'intaglio-linework-studio'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('assets')) {
        const store = db.createObjectStore('assets', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains('variants')) {
        const store = db.createObjectStore('variants', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId', { unique: false })
        store.createIndex('assetId', 'assetId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = fn(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function dbPut<T extends object>(store: StoreName, record: T): Promise<void> {
  await tx<IDBValidKey>(store, 'readwrite', (s) => s.put(record))
}

export async function dbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  await tx<undefined>(store, 'readwrite', (s) => s.delete(id))
}

export async function dbQueryIndex<T>(
  store: StoreName,
  indexName: string,
  value: string,
): Promise<T[]> {
  const db = await openDb()
  return new Promise<T[]>((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly')
    const index = transaction.objectStore(store).index(indexName)
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

// 便捷方法
export const projectRepo = {
  list: () => dbGetAll<StampProject>('projects'),
  get: (id: string) => dbGet<StampProject>('projects', id),
  put: (p: StampProject) => dbPut('projects', p),
  remove: (id: string) => dbDelete('projects', id),
}

export const assetRepo = {
  listByProject: (projectId: string) => dbQueryIndex<AssetRecord>('assets', 'projectId', projectId),
  get: (id: string) => dbGet<AssetRecord>('assets', id),
  put: (a: AssetRecord) => dbPut('assets', a),
  remove: (id: string) => dbDelete('assets', id),
}

export const variantRepo = {
  listByProject: (projectId: string) => dbQueryIndex<LineworkVariant>('variants', 'projectId', projectId),
  listByAsset: (assetId: string) => dbQueryIndex<LineworkVariant>('variants', 'assetId', assetId),
  get: (id: string) => dbGet<LineworkVariant>('variants', id),
  put: (v: LineworkVariant) => dbPut('variants', v),
  remove: (id: string) => dbDelete('variants', id),
}
