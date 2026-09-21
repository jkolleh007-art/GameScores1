import React, { useState } from 'react';
import {
  Terminal,
  Play,
  Copy,
  Check,
  Code,
  Radio,
  Clock,
  Send,
  Layers,
  Shield,
  Key,
} from 'lucide-react';

interface ApiConsoleViewProps {
  wsEvents: any[];
}

export const ApiConsoleView: React.FC<ApiConsoleViewProps> = ({ wsEvents }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/matches/live');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const endpoints = [
    { method: 'GET', path: '/api/matches/live', desc: 'Current in-play football matches' },
    { method: 'GET', path: '/api/matches/today', desc: 'All scheduled matches for today' },
    { method: 'GET', path: '/api/matches/fixtures?offset=1', desc: 'Upcoming fixtures tomorrow' },
    { method: 'GET', path: '/api/matches/results?offset=-1', desc: 'Completed results yesterday' },
    { method: 'GET', path: '/api/system/status', desc: 'Node & Scrapling health metrics' },
    { method: 'GET', path: '/api/facebook/posts?limit=10', desc: 'Recent Facebook posts history' },
    { method: 'GET', path: '/api/facebook/config', desc: 'Facebook page configuration' },
  ];

  const handleExecute = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const res = await fetch(selectedEndpoint);
      const data = await res.json();
      setResponseTime(Math.round(performance.now() - start));
      setApiResponse(data);
    } catch (e: any) {
      setApiResponse({ error: e.message });
      setResponseTime(Math.round(performance.now() - start));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Live Sports REST API & WebSockets Console</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Production endpoints delivering real-time Flashscore soccer data to web, mobile, and backend apps.
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Layout: API Explorer & WebSocket Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive REST Tester (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
              <Code className="w-4 h-4 text-emerald-400" />
              <span>Interactive REST Endpoint Tester</span>
            </h3>

            {/* Endpoint Selector Bar */}
            <div className="flex gap-2">
              <select
                id="api-endpoint-selector"
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              >
                {endpoints.map((ep) => (
                  <option key={ep.path} value={ep.path}>
                    {ep.method} {ep.path} - {ep.desc}
                  </option>
                ))}
              </select>

              <button
                id="run-api-request-btn"
                onClick={handleExecute}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{loading ? 'Sending...' : 'Send'}</span>
              </button>
            </div>

            {/* Response Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Response Payload</span>
                {responseTime !== null && (
                  <span className="font-mono text-emerald-400">Response time: {responseTime} ms</span>
                )}
              </div>

              <div className="relative">
                <pre className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-[380px] no-scrollbar">
                  {apiResponse
                    ? JSON.stringify(apiResponse, null, 2)
                    : '// Click "Send" above to query this live endpoint...'}
                </pre>

                {apiResponse && (
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(apiResponse, null, 2))}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Copy JSON response"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* cURL Snippet */}
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/60 text-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">cURL Command</div>
              <code className="text-emerald-400 font-mono text-[11px] break-all">
                curl -X GET "http://localhost:3000{selectedEndpoint}" -H "Accept: application/json"
              </code>
            </div>
          </div>
        </div>

        {/* Right Column: WebSocket Live Stream (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3 flex flex-col h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Live WebSocket Stream (/ws)</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                {wsEvents.length} events
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Web & mobile clients connect to <code className="text-emerald-300 font-mono">ws://host:3000/ws</code> for instantaneous score and incident broadcasts.
            </p>

            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto max-h-[460px] space-y-2 no-scrollbar">
              {wsEvents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center">
                  <Clock className="w-5 h-5 mb-2 text-slate-600" />
                  <span>Listening for live WebSocket packets...</span>
                </div>
              ) : (
                wsEvents.map((ev, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/70 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-emerald-400 font-mono">{ev.type}</span>
                      <span className="text-slate-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <pre className="text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(ev.payload, null, 1)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
