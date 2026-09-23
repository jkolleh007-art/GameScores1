import React, { useState, useMemo } from 'react';
import {
  Radio,
  Search,
  ChevronRight,
  Clock,
  Trophy,
  Activity,
  Globe,
  Share2,
  SlidersHorizontal,
  Square,
  Play,
} from 'lucide-react';
import { Match } from '../types';

interface LiveMatchesViewProps {
  matches: Match[];
  onSelectMatch: (match: Match) => void;
  onQuickPublish: (match: Match) => void;
  isFbConnected: boolean;
  isScraplingRunning?: boolean;
  onToggleScrapling?: () => void;
}

export function getMatchTimeDisplay(m: Match): { minuteStr: string; periodStr: string } {
  const stLower = (m.statusText || '').toLowerCase().trim();
  const isTrueHalfTime =
    m.status === 'PAUSED' ||
    stLower === 'ht' ||
    stLower === 'half-time' ||
    stLower === 'halftime' ||
    stLower === 'half time' ||
    stLower.startsWith('ht ') ||
    stLower.endsWith(' ht');

  if (isTrueHalfTime && !stLower.includes('1st') && !stLower.includes('2nd')) {
    return { minuteStr: "45' (HT)", periodStr: 'Half-Time' };
  }
  if (m.status === 'FINISHED') {
    return { minuteStr: "90' (FT)", periodStr: 'Full-Time' };
  }
  if (m.status === 'SCHEDULED') {
    const time = m.startTime ? new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Upcoming';
    return { minuteStr: time, periodStr: 'Upcoming' };
  }

  // 1. Check explicit minute on match object
  if (m.minute && m.minute > 0) {
    const period = m.statusText?.includes('2nd')
      ? '2nd Half'
      : m.statusText?.includes('1st')
      ? '1st Half'
      : m.minute <= 45
      ? '1st Half'
      : m.minute <= 90
      ? '2nd Half'
      : 'Extra Time';
    return { minuteStr: `${m.minute}' min`, periodStr: period };
  }

  // 2. Check if statusText contains a clean minute number like "62'" or "62' (2nd Half)"
  if (m.statusText) {
    const matched = m.statusText.match(/^(\d+)'?/);
    if (matched) {
      const min = parseInt(matched[1], 10);
      const period = m.statusText.includes('2nd')
        ? '2nd Half'
        : m.statusText.includes('1st')
        ? '1st Half'
        : min <= 45
        ? '1st Half'
        : min <= 90
        ? '2nd Half'
        : 'Extra Time';
      return { minuteStr: `${min}' min`, periodStr: period };
    }
  }

  if (m.statusText && m.statusText !== 'Live' && m.statusText !== '1') {
    const clean = m.statusText.includes("'") ? m.statusText : `${m.statusText}'`;
    return { minuteStr: clean, periodStr: 'Live' };
  }

  return { minuteStr: "Live", periodStr: 'In-Play' };
}

export const LiveMatchesView: React.FC<LiveMatchesViewProps> = ({
  matches,
  onSelectMatch,
  onQuickPublish,
  isFbConnected,
  isScraplingRunning = true,
  onToggleScrapling,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');

  // Extract unique countries
  const countries = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => {
      if (m.league?.country) set.add(m.league.country);
    });
    return Array.from(set).sort();
  }, [matches]);

  // Filter matches
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const matchText = `${m.homeTeam.name} ${m.awayTeam.name} ${m.league.name} ${m.league.country}`.toLowerCase();
      const matchesSearch = !searchTerm || matchText.includes(searchTerm.toLowerCase());
      const matchesCountry = selectedCountry === 'ALL' || m.league.country === selectedCountry;
      return matchesSearch && matchesCountry;
    });
  }, [matches, searchTerm, selectedCountry]);

  // Group by league
  const groupedMatches = useMemo(() => {
    const map = new Map<string, { league: Match['league']; matches: Match[] }>();
    filteredMatches.forEach((m) => {
      const key = `${m.league.country} - ${m.league.name}`;
      if (!map.has(key)) {
        map.set(key, { league: m.league, matches: [] });
      }
      map.get(key)!.matches.push(m);
    });
    return Array.from(map.values());
  }, [filteredMatches]);

  return (
    <div className="space-y-6">
      {/* Alert if Scrapling is currently stopped */}
      {!isScraplingRunning && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-200">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-100">Scrapling Engine is Currently Stopped</p>
              <p className="text-[11px] text-rose-300/90 mt-0.5">
                Automatic background polling from Flashscore is paused. Live scores will not refresh automatically until started.
              </p>
            </div>
          </div>
          {onToggleScrapling && (
            <button
              onClick={onToggleScrapling}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shrink-0 transition-all shadow-sm active:scale-95 self-start sm:self-auto"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Resume Scrapling</span>
            </button>
          )}
        </div>
      )}

      {/* Top Filter & Summary Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h2 className="text-base font-bold text-white">Live Matches In Progress</h2>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-500/30">
              {matches.length} active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time scorelines and events collected via Scrapling from Flashscore
          </p>
        </div>

        {/* Search & Country Select */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              id="live-matches-search"
              placeholder="Filter teams or leagues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            id="country-filter-select"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Countries ({countries.length})</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* No matches state */}
      {groupedMatches.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <Radio className="w-10 h-10 mx-auto mb-3 text-slate-600 animate-pulse" />
          <h3 className="text-base font-semibold text-slate-300">No live matches matching your criteria</h3>
          <p className="text-xs text-slate-500 mt-1">
            {matches.length === 0
              ? 'There are currently no football games in-play right now. Check "Today\'s Schedule" for upcoming fixtures.'
              : 'Try clearing the search query or changing the country filter.'}
          </p>
        </div>
      )}

      {/* Grouped Match Lists */}
      <div className="space-y-5">
        {groupedMatches.map((group) => (
          <div
            key={`${group.league.country}-${group.league.name}`}
            className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-md"
          >
            {/* League Header */}
            <div className="bg-slate-800/60 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {group.league.country}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-xs font-bold text-slate-200 flex items-center space-x-1">
                  <Trophy className="w-3 h-3 text-amber-400 mr-1 inline" />
                  {group.league.name}
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
              </span>
            </div>

            {/* Matches list */}
            <div className="divide-y divide-slate-800/50">
              {group.matches.map((m) => (
                <div
                  key={m.id}
                  id={`match-row-${m.id}`}
                  onClick={() => onSelectMatch(m)}
                  className="px-4 py-3 hover:bg-slate-800/40 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  {/* Status & Minute */}
                  {(() => {
                    const timeInfo = getMatchTimeDisplay(m);
                    return (
                      <div className="w-24 shrink-0 flex flex-col items-start">
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm">
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                          <span className="font-mono tracking-tight">{timeInfo.minuteStr}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 uppercase font-semibold tracking-wider">
                          {timeInfo.periodStr}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Teams and Scoreline */}
                  <div className="flex-1 px-4 grid grid-cols-12 items-center gap-2">
                    {/* Home Team */}
                    <div className="col-span-5 text-right flex items-center justify-end space-x-2">
                      <span className="font-semibold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors truncate">
                        {m.homeTeam.name}
                      </span>
                    </div>

                    {/* Score Badge */}
                    <div className="col-span-2 flex items-center justify-center">
                      <div className="bg-slate-950 px-3.5 py-1 rounded-lg border border-slate-700 text-base font-extrabold tracking-wider text-emerald-400 shadow-inner min-w-[58px] text-center">
                        {m.homeScore} - {m.awayScore}
                      </div>
                    </div>

                    {/* Away Team */}
                    <div className="col-span-5 text-left flex items-center justify-start space-x-2">
                      <span className="font-semibold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors truncate">
                        {m.awayTeam.name}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      id={`post-fb-${m.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickPublish(m);
                      }}
                      title="Publish match update to Facebook Page"
                      className="p-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-800/50 text-xs flex items-center space-x-1 transition-all"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px] font-medium">Post</span>
                    </button>

                    <div className="p-1 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
