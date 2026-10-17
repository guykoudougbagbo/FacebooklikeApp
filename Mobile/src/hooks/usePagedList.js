import { useCallback, useEffect, useState } from 'react'
import { nextPagePath } from '@shared/api'
import { api } from '../api/client'

/** Loads a paginated API list one page at a time, with pull-to-refresh. */
export function usePagedList(basePath) {
  const [items, setItems] = useState(null)
  const [nextPath, setNextPath] = useState(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [version, setVersion] = useState(0)

  const showPage = useCallback((page, append) => {
    setItems((current) => (append ? [...(current ?? []), ...page.results] : page.results))
    setNextPath(nextPagePath(basePath, page.next))
    setError('')
  }, [basePath])

  const showError = useCallback((err) => {
    setError(err.message)
    setItems((current) => current ?? [])
  }, [])

  useEffect(() => {
    let active = true
    api(basePath)
      .then((page) => active && showPage(page, false), (err) => active && showError(err))
      .finally(() => active && setRefreshing(false))
    return () => {
      active = false
    }
  }, [basePath, version, showPage, showError])

  const refresh = useCallback(() => {
    setRefreshing(true)
    setVersion((v) => v + 1)
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextPath || loadingMore) return
    setLoadingMore(true)
    try {
      showPage(await api(nextPath), true)
    } catch (err) {
      showError(err)
    }
    setLoadingMore(false)
  }, [nextPath, loadingMore, showPage, showError])

  const addItem = useCallback((item) => setItems((current) => [...(current ?? []), item]), [])
  const replaceItem = useCallback(
    (item) => setItems((current) => current?.map((existing) => (existing.id === item.id ? item : existing))),
    [],
  )

  return { items, error, hasMore: Boolean(nextPath), loadMore, loadingMore, refresh, refreshing, addItem, replaceItem }
}
