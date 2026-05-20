'use client'

import styles from './dashboard.module.css'
import { useRealtimeMetrics } from '../hooks/useRealtimeMetrics'

export default function Dashboard() {
  const {
    metrics,
    status,
    lastUpdated,
    error,
    reconnect,
    isConnected
  } = useRealtimeMetrics({
    pollInterval: 2000,
    maxRetries: 5,
    retryDelay: 3000
  })

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const getStatusColor = (value: number, threshold: number, inverse = false) => {
    if (inverse) {
      if (value < threshold) return '#22c55e'
      if (value < threshold * 1.5) return '#eab308'
      return '#ef4444'
    }
    if (value > threshold) return '#22c55e'
    if (value > threshold * 0.5) return '#eab308'
    return '#ef4444'
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1>Real-Time Metrics Dashboard</h1>
        <div className={styles.status}>
          <span className={isConnected ? styles.connected : styles.disconnected}>
            {status === 'connecting' && '⟳ Connecting'}
            {status === 'connected' && '● Connected'}
            {status === 'disconnected' && '○ Disconnected'}
            {status === 'error' && '⚠ Error'}
          </span>
          <span className={styles.timestamp}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
          {status === 'disconnected' && (
            <button onClick={reconnect} className={styles.reconnectBtn}>
              Reconnect
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          <span>Connection Error: {error}</span>
          <button onClick={reconnect}>Try Again</button>
        </div>
      )}

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Total Requests</h3>
            <span className={styles.trend}>↑ 12.5%</span>
          </div>
          <div className={styles.metricValue}>
            {formatNumber(metrics.totalRequests)}
          </div>
          <div className={styles.metricLabel}>requests/min</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Active Users</h3>
            <span className={styles.trend}>↑ 8.2%</span>
          </div>
          <div className={styles.metricValue}>
            {formatNumber(metrics.activeUsers)}
          </div>
          <div className={styles.metricLabel}>concurrent</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>CPU Usage</h3>
          </div>
          <div className={styles.metricValue}>
            {metrics.cpuUsage.toFixed(1)}%
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${metrics.cpuUsage}%`,
                backgroundColor: getStatusColor(metrics.cpuUsage, 70, true)
              }}
            />
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Memory Usage</h3>
          </div>
          <div className={styles.metricValue}>
            {metrics.memoryUsage.toFixed(1)}%
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${metrics.memoryUsage}%`,
                backgroundColor: getStatusColor(metrics.memoryUsage, 80, true)
              }}
            />
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Error Rate</h3>
          </div>
          <div className={styles.metricValue} style={{color: getStatusColor(metrics.errorRate, 1, true)}}>
            {metrics.errorRate.toFixed(2)}%
          </div>
          <div className={styles.metricLabel}>of total requests</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Response Time</h3>
          </div>
          <div className={styles.metricValue}>
            {metrics.responseTime}ms
          </div>
          <div className={styles.metricLabel}>avg p95</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Throughput</h3>
          </div>
          <div className={styles.metricValue}>
            {formatNumber(metrics.throughput)}
          </div>
          <div className={styles.metricLabel}>ops/sec</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <h3>Queue Length</h3>
          </div>
          <div className={styles.metricValue}>
            {metrics.queueLength}
          </div>
          <div className={styles.metricLabel}>pending jobs</div>
        </div>
      </div>

      <div className={styles.chartsSection}>
        <div className={styles.chartCard}>
          <h3>Request Volume (Last 60 mins)</h3>
          <div className={styles.sparkline}>
            {/* Placeholder for actual chart implementation */}
            <svg viewBox="0 0 400 100" className={styles.chart}>
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points="0,80 40,70 80,75 120,60 160,65 200,50 240,55 280,45 320,50 360,40 400,45"
              />
            </svg>
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3>System Health</h3>
          <div className={styles.healthGrid}>
            <div className={styles.healthItem}>
              <span>API Gateway</span>
              <span className={styles.healthStatus} style={{color: '#22c55e'}}>●</span>
            </div>
            <div className={styles.healthItem}>
              <span>Database</span>
              <span className={styles.healthStatus} style={{color: '#22c55e'}}>●</span>
            </div>
            <div className={styles.healthItem}>
              <span>Cache</span>
              <span className={styles.healthStatus} style={{color: '#22c55e'}}>●</span>
            </div>
            <div className={styles.healthItem}>
              <span>Queue</span>
              <span className={styles.healthStatus} style={{color: '#eab308'}}>●</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}