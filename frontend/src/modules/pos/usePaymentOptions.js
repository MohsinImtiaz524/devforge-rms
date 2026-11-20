import { useEffect, useState } from 'react'
import { api } from '../../api/client'

const emptyRows = Object.freeze([])
const cache = new Map()
const maxAge = 60000
const keyFor = user => `${user?.shop_id || ''}:${user?.id || ''}`
export function loadPaymentOption(user, kind, force = false) {
  if (!user?.shop_id) return Promise.reject(new Error('No shop assigned'))
  const key = `${keyFor(user)}:${kind}`
  const current = cache.get(key)
  if (current?.pending) return current.pending
  if (!force && current?.rows && Date.now() - current.at < maxAge) return Promise.resolve(current.rows)
  const entry = { ...current }
  entry.pending = api(`/api/shop-settings/${kind}`).then(rows => {
    if (!Array.isArray(rows)) throw new Error('Invalid payment options response')
    cache.set(key, { rows, at: Date.now() })
    return rows
  }).catch(error => { cache.delete(key); throw error })
  cache.set(key, entry)
  return entry.pending
}
export function usePaymentOptions(user) {
  const key = keyFor(user)
  const [state, setState] = useState({})
  useEffect(() => {
    let active = true
    const refresh = () => {
      for (const kind of ['discounts', 'taxes']) {
        loadPaymentOption(user, kind).then(rows => {
          if (active) setState(previous => ({ ...previous, [kind]: { key, rows } }))
        }).catch(error => {
          if (active) setState(previous => ({ ...previous, [kind]: { key, error: error.message } }))
        })
      }
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [key])
  function option(kind) {
    const value = state[kind]?.key === key ? state[kind] : null
    const cached = cache.get(`${key}:${kind}`)
    return { rows: value?.rows || cached?.rows || emptyRows, loading: !value && !cached?.rows, error: value?.error }
  }
  function retry(kind) {
    setState(previous => ({ ...previous, [kind]: null }))
    loadPaymentOption(user, kind, true).then(rows => setState(previous => ({ ...previous, [kind]: { key, rows } }))).catch(error => setState(previous => ({ ...previous, [kind]: { key, error: error.message } })))
  }
  return { discounts: option('discounts'), taxes: option('taxes'), retry }
}
