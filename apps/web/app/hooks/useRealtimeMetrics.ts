import { useState, useEffect, useCallback, useRef } from 'react'

interface UseRealtimeMetricsOptions {
  pollInterval?: number
  maxRetries?: number
  retryDelay?: number
}

export interface Metrics {
  totalRequests: number
  activeUsers: number
  cpuUsage: number
  memoryUsage: number
  errorRate: number
  responseTime: number
  throughput: number
  queueLength: number
}

export function useRealtimeMetrics(options: UseRealtimeMetricsOptions = {}) {
  const {
    pollInterval = 2000,
    maxRetries = 3,
    retryDelay = 5000
  } = options

  const [metrics, setMetrics] = useState<Metrics>({
    totalRequests: 0,
    activeUsers: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    errorRate: 0,
    responseTime: 0,
    throughput: 0,
    queueLength: 0
  })

  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)

  const retryCount = useRef(0)
  const intervalId = useRef<NodeJS.Timeout | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics', {
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setMetrics(data)
      setLastUpdated(new Date())
      setStatus('connected')
      setError(null)
      retryCount.current = 0
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch metrics'
      setError(errorMessage)
      setStatus('error')

      // Implement retry logic
      if (retryCount.current < maxRetries) {
        retryCount.current++
        setTimeout(() => {
          fetchMetrics()
        }, retryDelay)
      } else {
        setStatus('disconnected')
      }
    }
  }, [maxRetries, retryDelay])

  const startPolling = useCallback(() => {
    // Clear existing interval if any
    if (intervalId.current) {
      clearInterval(intervalId.current)
    }

    // Initial fetch
    fetchMetrics()

    // Set up polling interval
    intervalId.current = setInterval(fetchMetrics, pollInterval)
  }, [fetchMetrics, pollInterval])

  const stopPolling = useCallback(() => {
    if (intervalId.current) {
      clearInterval(intervalId.current)
      intervalId.current = null
    }
  }, [])

  const reconnect = useCallback(() => {
    retryCount.current = 0
    setStatus('connecting')
    startPolling()
  }, [startPolling])

  useEffect(() => {
    startPolling()

    // Cleanup on unmount
    return () => {
      stopPolling()
    }
  }, [startPolling, stopPolling])

  // Visibility change handler - pause/resume when tab is hidden/visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [startPolling, stopPolling])

  return {
    metrics,
    status,
    lastUpdated,
    error,
    reconnect,
    isConnected: status === 'connected',
    isLoading: status === 'connecting'
  }
}