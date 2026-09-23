import React from 'react';
import {
  Activity,
  Radio,
  Share2,
  RefreshCw,
  Database,
  Terminal,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  ShieldCheck,
  Lock,
  User,
  Square,
  Play,
} from 'lucide-react';
import { SystemStatus } from '../types';
import { useAdminAuth } from '../context/AdminAuthContext';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  systemStatus: SystemStatus | null;
  wsConnected: boolean;
  onManualSync: () => void;
  isSyncing: boolean;
  liveMatchCount: number;
  onOpenAdminModal: () => void;
  onToggleScrapling?: () => void;
  isTogglingScrapling?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  systemStatus,
  wsConnected,
  onManualSync,
  isSyncing,
  liveMatchCount,
  onOpenAdminModal,
  onToggleScrapling,
  isTogglingScrapling = false,
}) => {
  const { adminUser, isAuthenticated, databaseInfo } = useAdminAuth();
  const scraplingOnline = systemStatus?.scraplingService?.status === 'ONLINE';
  const isScraplingRunning = systemStatus?.syncEngine?.isRunning ?? true;
  const fbConfigured = Boolean(systemStatus?.facebookPublisher?.config?.pageId);
  const selectedLeaguesCount = systemStatus?.dailyLeagueSelection?.selectedCount ?? 0;
  const isDailyLeaguesConfigured = Boolean(systemStatus?.dailyLeagueSelection?.isConfigured && selectedLeaguesCount > 0);

  const navTabs = [
    { id: 'live', label: 'Live Matches', count: liveMatchCount, icon: Radio },
    { id: 'today', label: "Today's Schedule", icon: Activity },
    { id: 'fixtures', label: 'Fixtures & Results', icon: CalendarIcon },
    {
      id: 'leagues',
      label: 'League Selection',
      icon: Trophy,
      badge: isDailyLeaguesConfigured ? `${selectedLeaguesCount} Today` : 'Blackout',
    },
    { id: 'facebook', label: 'Facebook Publisher', icon: Share2, badge: fbConfigured ? 'Configured' : 'Setup' },
    { id: 'api', label: 'API & WebSockets', icon: Terminal },
    { id: 'monitoring', label: 'System Health', icon: Server },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-lg text-slate-100">
      {/* Top Banner Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-emerald-500/20 shadow-md">
              <Zap className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white">ScoreFlow</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Flashscore Scrapling
                </span>
              </div>
              <p className="text-xs text-slate-400">Live Sports Scores API & Facebook Live Publisher</p>
            </div>
          </div>

          {/* Mobile Quick Action for Stop/Start Scrapling */}
          <div className="flex md:hidden items-center space-x-2">
            {onToggleScrapling && (
              <button
                id="mobile-toggle-scrapling-btn"
                type="button"
                onClick={onToggleScrapling}
                disabled={isTogglingScrapling}
                title={isScraplingRunning ? 'Stop Scrapling' : 'Start Scrapling'}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all shadow-sm active:scale-95 ${
                  isScraplingRunning
                    ? 'bg-rose-950/60 text-rose-300 border-rose-700/60'
                    : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                }`}
              >
                {isScraplingRunning ? (
                  <>
                    <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                    <span>Stop Scrapling</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                    <span>Start Scrapling</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Service Status Badges */}
          <div className="hidden md:flex items-center space-x-3 text-xs">
            {/* WebSocket Status */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
                wsConnected
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/40'
              }`}
              title={wsConnected ? 'WebSocket connected: receiving real-time live events' : 'WebSocket disconnected'}
            >
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="font-medium">WS {wsConnected ? 'Live' : 'Connecting'}</span>
            </div>

            {/* Python Scrapling Status & Stop/Start Button */}
            <div className="flex items-center space-x-1.5">
              <div
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
                  isScraplingRunning && scraplingOnline
                    ? 'bg-blue-950/40 text-blue-300 border-blue-800/40'
                    : 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                }`}
                title={
                  !isScraplingRunning
                    ? 'Scrapling engine is paused'
                    : `Python Scrapling v${systemStatus?.scraplingService?.scrapling_version || '0.4.15'}`
                }
              >
                <Activity className={`w-3.5 h-3.5 ${isScraplingRunning ? 'text-blue-400' : 'text-rose-400'}`} />
                <span>
                  Scrapling: {isScraplingRunning ? (scraplingOnline ? `${systemStatus?.scraplingService?.latency_ms ?? 25}ms` : 'Online') : 'Stopped'}
                </span>
              </div>

              {/* Button to Stop/Start Scrapling */}
              {onToggleScrapling && (
                <button
                  id="header-stop-scrapling-btn"
                  type="button"
                  onClick={onToggleScrapling}
                  disabled={isTogglingScrapling}
                  title={isScraplingRunning ? 'Click to stop live Scrapling' : 'Click to start live Scrapling'}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-60 ${
                    isScraplingRunning
                      ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border-rose-700/60 hover:border-rose-500'
                      : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/60 hover:border-emerald-500'
                  }`}
                >
                  {isScraplingRunning ? (
                    <>
                      <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                      <span>Stop Scrapling</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                      <span>Start Scrapling</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Daily Leagues Today Badge */}
            <button
              id="header-daily-leagues-status-btn"
              onClick={() => setActiveTab('leagues')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                isDailyLeaguesConfigured
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/40 hover:bg-amber-900/40'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/40 hover:bg-rose-900/40 animate-pulse'
              }`}
              title="Daily League Selection: Controls which games are posted and shown for today"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {isDailyLeaguesConfigured
                  ? `${selectedLeaguesCount} Leagues Today`
                  : 'No Leagues Selected'}
              </span>
            </button>

            {/* Facebook Status */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
                fbConfigured
                  ? 'bg-indigo-950/40 text-indigo-300 border-indigo-800/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>FB: {fbConfigured ? 'Connected' : 'Not Connected'}</span>
            </div>

            {/* Database Engine Status */}
            <button
              id="header-db-status-btn"
              onClick={onOpenAdminModal}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full border bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700 transition-all cursor-pointer"
              title={`PostgreSQL: ${databaseInfo?.databaseUrlMasked || 'gamescores_8n73'}`}
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">PostgreSQL</span>
            </button>

            {/* Admin Authentication Trigger */}
            <button
              id="header-admin-auth-btn"
              onClick={onOpenAdminModal}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-medium ${
                isAuthenticated
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              {isAuthenticated ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Admin: {adminUser?.username}</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Admin Login</span>
                </>
              )}
            </button>

            {/* Manual Sync Trigger */}
            <button
              id="manual-sync-button"
              onClick={onManualSync}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium px-3 py-1.5 rounded-lg transition-all shadow-sm active:scale-95 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Live'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 overflow-x-auto py-2 border-t border-slate-800/60 no-scrollbar">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-emerald-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

function CalendarIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
