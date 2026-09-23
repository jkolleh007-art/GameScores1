import React from 'react';
import {
  Server,
  Activity,
  Database,
  Cpu,
  Radio,
  Share2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Square,
  Play,
} from 'lucide-react';
import { SystemStatus } from '../types';

interface SystemMonitoringViewProps {
  status: SystemStatus | null;
  onManualSync: () => void;
  isSyncing: boolean;
  onToggleScrapling?: () => void;
  isTogglingScrapling?: boolean;
}

export const SystemMonitoringView: React.FC<SystemMonitoringViewProps> = ({
  status,
  onManualSync,
  isSyncing,
  onToggleScrapling,
  isTogglingScrapling = false,
}) => {
  const scraplingOnline = status?.scraplingService?.status === 'ONLINE';
  const isScraplingRunning = status?.syncEngine?.isRunning ?? true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Server className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">System Health & Architecture Monitoring</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live telemetry for Scrapling microservice, Express API, WebSocket gateway, Cache, and Facebook publisher.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Stop / Start Scrapling Button */}
          {onToggleScrapling && (
            <button
              id="monitoring-stop-scrapling-btn"
              type="button"
              onClick={onToggleScrapling}
              disabled={isTogglingScrapling}
              title={isScraplingRunning ? 'Stop Scrapling Polling' : 'Resume Scrapling Polling'}
              className={`font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-2 transition-all shadow-sm active:scale-95 border cursor-pointer ${
                isScraplingRunning
                  ? 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-700/60 hover:border-rose-500'
                  : 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border-emerald-700/60 hover:border-emerald-500'
              }`}
            >
              {isScraplingRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                  <span>Stop Scrapling</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                  <span>Start Scrapling</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onManualSync}
            disabled={isSyncing}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-2 transition-all shadow-sm active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Trigger Immediate Sync'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Microservices */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Scrapling Python Scraper Microservice */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Python Scrapling Engine
              </h3>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                scraplingOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
            >
              {scraplingOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Headless stealth HTTP/Fetch framework running on port 5001 with bypass capabilities for Flashscore feeds.
          </p>

          <div className="space-y-1.5 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Scrapling Version:</span>
              <span className="text-slate-200 font-mono">v{status?.scraplingService?.scrapling_version || '0.4.15'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target Source:</span>
              <span className="text-emerald-400 font-mono">Flashscore Ninja Feed</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Feed Latency:</span>
              <span className="text-slate-200 font-mono">{status?.scraplingService?.latency_ms ?? 24} ms</span>
            </div>
          </div>
        </div>

        {/* Card 2: Node.js Sync Engine */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Sports Sync Engine
              </h3>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isScraplingRunning
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
            >
              {isScraplingRunning ? 'POLLING ACTIVE' : 'POLLING STOPPED'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Diffs incoming Flashscore match payloads to extract instantaneous goals, cards, and whistle events.
          </p>

          <div className="space-y-1.5 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Polling Interval:</span>
              <span className="text-slate-200 font-mono">{status?.syncEngine?.intervalSeconds || 15}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Live Matches Tracked:</span>
              <span className="text-emerald-400 font-mono font-bold">{status?.syncEngine?.trackedLiveMatches || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Scrape Cycles:</span>
              <span className="text-slate-200 font-mono">{status?.syncEngine?.scrapeCount || 0}</span>
            </div>
          </div>

          {/* Inline Card Button */}
          {onToggleScrapling && (
            <button
              onClick={onToggleScrapling}
              disabled={isTogglingScrapling}
              className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 border transition-all ${
                isScraplingRunning
                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-900/60'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
              }`}
            >
              {isScraplingRunning ? (
                <>
                  <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                  <span>Stop Scrapling Polling</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                  <span>Resume Scrapling Polling</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Card 3: Real-Time WebSocket Gateway */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                WebSocket Gateway
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              PORT {status?.nodeApi?.port || 3000}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Low-latency persistent socket server broadcasting scores to connected frontends.
          </p>

          <div className="space-y-1.5 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Connected Clients:</span>
              <span className="text-emerald-400 font-mono font-bold">{status?.nodeApi?.connectedWsClients || 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Server Uptime:</span>
              <span className="text-slate-200 font-mono">{Math.round((status?.nodeApi?.uptime || 0) / 60)} min</span>
            </div>
          </div>
        </div>

        {/* Card 4: Facebook Publisher Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Share2 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Facebook Publisher Queue
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              GRAPH API v22.0
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Asynchronous background queue with rate-limiting to prevent Facebook Page API throttling.
          </p>

          <div className="space-y-1.5 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Queue Length:</span>
              <span className="text-slate-200 font-mono">{status?.facebookPublisher?.queue?.queueLength || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Rate Limit:</span>
              <span className="text-slate-200 font-mono">Max {status?.facebookPublisher?.queue?.maxPerMinute || 12}/min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Publishing Mode:</span>
              <span className="text-blue-400 font-mono font-medium">
                Admin Manual Only
              </span>
            </div>
          </div>
        </div>

        {/* Card 5: Persistence Database */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Persistence Layer
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {status?.persistence?.type || 'Persistent Store'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Stores matches, historical scores, match incidents, Facebook logs, and administrative keys.
          </p>

          <div className="space-y-1.5 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Engine:</span>
              <span className="text-slate-200 font-mono">{status?.persistence?.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="text-emerald-400 font-mono">Connected</span>
            </div>
          </div>
        </div>

        {/* Card 6: Cache Layer */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                High-Speed Cache
              </h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
              {status?.cache?.type || 'Cache'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Sub-millisecond responses for live match requests and feed caching with automatic TTL eviction.
          </p>

          <div className="space-y-1.5 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-400">Cache Type:</span>
              <span className="text-slate-200 font-mono">{status?.cache?.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">TTL:</span>
              <span className="text-slate-200 font-mono">30s for Live Feeds</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
