export interface ServiceStatus {
  status: string
  latency_ms?: number
  error?: string
  peer_hostname?: string
  peer_verified?: boolean
}

export interface HealthData {
  version: string
  uptime_seconds: number
  platform: string
  hostname: string
  sqlite_cache_entries: number
  sqlite_db_size_bytes: number
  services: {
    bluebubbles: ServiceStatus
    openclaw: ServiceStatus
    supabase: ServiceStatus
  }
}

export interface TailscalePeer {
  ip: string
  hostname: string
  online: boolean
}

export interface TailscaleData {
  peers: TailscalePeer[]
}
