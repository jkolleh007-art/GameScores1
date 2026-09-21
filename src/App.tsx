import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { LiveMatchesView } from './components/LiveMatchesView';
import { TodayMatchesView } from './components/TodayMatchesView';
import { FixturesResultsView } from './components/FixturesResultsView';
import { MatchDetailModal } from './components/MatchDetailModal';
import { FacebookPublisherView } from './components/FacebookPublisherView';
import { DailyLeagueSelectionView } from './components/DailyLeagueSelectionView';
import { ApiConsoleView } from './components/ApiConsoleView';
import { SystemMonitoringView } from './components/SystemMonitoringView';
import { AdminAuthModal } from './components/AdminAuthModal';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { Match, SystemStatus } from './types';
import { Radio, Calendar, CheckCircle, Bell, Trophy, Globe, Clock, ChevronRight } from 'lucide-react';

function DashboardContent() {
  const { showLoginModal, setShowLoginModal, authFetch, isAuthenticated } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<string>('live');
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [todayMatches, setTodayMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsEvents, setWsEvents] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [toastNotification, setToastNotification] = useState<{ title: string; body: string; type: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial live matches and system status
  const fetchLiveMatches = useCallback(async () => {
    try {
      const res = await fetch('/api/matches/live');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLiveMatches(json.data);
      }
    } catch (e) {
      console.warn('Error fetching live matches:', e);
    }
  }, []);

  const fetchTodayMatches = useCallback(async () => {
    try {
      const res = await fetch('/api/matches/today');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTodayMatches(json.data);
      }
    } catch (e) {
      console.warn('Error fetching today matches:', e);
    }
  }, []);

  const fetchSystemStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/status');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setSystemStatus(json);
      }
    } catch (e) {
      console.warn('Error fetching system status:', e);
    }
  }, []);

  // Initialize the GameScores WebSocket connection.
  // Vite HMR is disabled; this socket is only the application's /ws gateway.
  useEffect(() => {
    let shouldReconnect = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 3000;

    const connectWs = () => {
      if (!shouldReconnect) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('[WebSocket] Connecting to', wsUrl);

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (error) {
        console.warn('[WebSocket] Connection could not be created:', error);
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setWsConnected(true);
        reconnectDelay = 3000;
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);

          setWsEvents((prev) => [
            { type: packet.type, payload: packet.payload, timestamp: Date.now() },
            ...prev.slice(0, 49),
          ]);

          if (packet.type === 'live_matches_updated') {
            const matches = Array.isArray(packet.payload)
              ? packet.payload
              : packet.payload?.matches;

            if (Array.isArray(matches)) {
              setLiveMatches(matches);
            }
          } else if (packet.type === 'score_change') {
            const m = packet.payload?.match;
            if (m) {
              setToastNotification({
                title: `⚽ GOAL! ${m.homeTeam.name} ${m.homeScore} - ${m.awayScore} ${m.awayTeam.name}`,
                body: `${m.league.name} (${m.statusText || `${m.minute || 0}'`})`,
                type: 'goal',
              });
              setTimeout(() => setToastNotification(null), 7000);
            }
          } else if (packet.type === 'match_event') {
            const ev = packet.payload;
            if (ev?.type === 'RED_CARD') {
              setToastNotification({
                title: `🟥 RED CARD! ${ev.playerName}`,
                body: `Minute ${ev.minute}'`,
                type: 'red_card',
              });
              setTimeout(() => setToastNotification(null), 7000);
            }
          } else if (packet.type === 'daily_leagues_updated') {
            fetchLiveMatches();
            fetchTodayMatches();
            fetchSystemStatus();
            setToastNotification({
              title: `🏆 Daily League Selection Updated`,
              body: `${packet.payload?.count ?? 0} league(s) active for today (${packet.payload?.date ?? 'today'}). Matches filtered accordingly.`,
              type: 'info',
            });
            setTimeout(() => setToastNotification(null), 6000);
          }
        } catch (error) {
          console.warn('[WebSocket] Invalid server message:', error);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (shouldReconnect) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose will perform the reconnect. Do not call close() here while
        // the socket is still CONNECTING, which can produce noisy browser errors.
        console.warn('[WebSocket] Connection error; waiting for close/reconnect.');
      };
    };

    const scheduleReconnect = () => {
      if (!shouldReconnect || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWs();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    };

    connectWs();
    fetchLiveMatches();
    fetchTodayMatches();
    fetchSystemStatus();

    const statusInterval = setInterval(fetchSystemStatus, 10000);
    const livePoll = setInterval(fetchLiveMatches, 15000);

    return () => {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      clearInterval(statusInterval);
      clearInterval(livePoll);

      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(1000, 'component unmounted');
      }
    };
  }, [fetchLiveMatches, fetchTodayMatches, fetchSystemStatus]);

  // Trigger manual sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await authFetch('/api/system/sync', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        await Promise.all([fetchLiveMatches(), fetchTodayMatches(), fetchSystemStatus()]);
      }
    } catch (e) {
      console.warn('Manual sync notice:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Publish to Facebook action
  const handlePublishToFacebook = async (
    match: Match,
    eventType: string,
    customMessage?: string
  ) => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      throw new Error('Please sign in as Admin to publish to Facebook.');
    }

    const res = await authFetch('/api/facebook/publish-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: match.id,
        matchTitle: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
        leagueName: match.league.name,
        eventType,
        message: customMessage || `⚽ LIVE UPDATE: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}\n🏆 ${match.league.name}`,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to enqueue post');
    }
  };

  const isFbConnected = Boolean(systemStatus?.facebookPublisher?.config?.isConnected);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Real-time Toast Alert */}
      {toastNotification && (
        <div className="fixed top-20 right-4 z-50 animate-bounce duration-1000 bg-slate-900 border border-emerald-500/60 shadow-2xl rounded-xl p-3.5 max-w-sm flex items-start space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-white">{toastNotification.title}</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">{toastNotification.body}</p>
          </div>
        </div>
      )}

      {/* Main Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        systemStatus={systemStatus}
        wsConnected={wsConnected}
        onManualSync={handleManualSync}
        isSyncing={isSyncing}
        liveMatchCount={liveMatches.length}
        onOpenAdminModal={() => setShowLoginModal(true)}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'live' && (
          <LiveMatchesView
            matches={liveMatches}
            onSelectMatch={(m) => setSelectedMatch(m)}
            onQuickPublish={(m) => {
              setSelectedMatch(m);
            }}
            isFbConnected={isFbConnected}
          />
        )}

        {activeTab === 'today' && (
          <TodayMatchesView
            matches={todayMatches}
            onSelectMatch={(m) => setSelectedMatch(m)}
          />
        )}

        {activeTab === 'fixtures' && (
          <FixturesResultsView
            type="fixtures"
            onSelectMatch={(m) => setSelectedMatch(m)}
          />
        )}

        {activeTab === 'leagues' && (
          <DailyLeagueSelectionView
            onSelectionSaved={() => {
              fetchLiveMatches();
              fetchTodayMatches();
              fetchSystemStatus();
            }}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'facebook' && <FacebookPublisherView />}

        {activeTab === 'api' && <ApiConsoleView wsEvents={wsEvents} />}

        {activeTab === 'monitoring' && (
          <SystemMonitoringView
            status={systemStatus}
            onManualSync={handleManualSync}
            isSyncing={isSyncing}
          />
        )}
      </main>

      {/* Match Detail Modal Drawer */}
      <MatchDetailModal
        match={selectedMatch}
        onClose={() => setSelectedMatch(null)}
        onPublishToFacebook={handlePublishToFacebook}
        isFbConnected={isFbConnected}
      />

      {/* Admin Authentication & Account Modal */}
      <AdminAuthModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <DashboardContent />
    </AdminAuthProvider>
  );
}
