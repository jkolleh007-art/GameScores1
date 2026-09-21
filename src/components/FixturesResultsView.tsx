import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Trophy,
  Loader2,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { Match } from '../types';

interface FixturesResultsViewProps {
  type: 'fixtures' | 'results';
  onSelectMatch: (match: Match) => void;
}

interface LeagueGroup {
  id: string;
  country: string;
  name: string;
  flag?: string;
  matches: Match[];
}

export const FixturesResultsView: React.FC<FixturesResultsViewProps> = ({
  type,
  onSelectMatch,
}) => {
  const [offset, setOffset] = useState<number>(type === 'fixtures' ? 1 : 0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Reset default offset when switching between fixtures and results
    setOffset(type === 'fixtures' ? 1 : 0);
    setSelectedCountry('ALL');
    setSearchTerm('');
  }, [type]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const endpoint =
      type === 'fixtures'
        ? `/api/matches/fixtures?offset=${offset}`
        : `/api/matches/results?offset=${offset}`;

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        if (json.success && Array.isArray(json.data)) {
          setMatches(json.data);
        } else {
          setError(json.error || 'Failed to load matches');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Network error fetching data');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [type, offset]);

  // Extract unique countries
  const countries = useMemo(() => {
    const set = new Set<string>();
    matches.forEach((m) => {
      if (m.league?.country) {
        set.add(m.league.country);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  // Filter matches based on search and country
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // Country filter
      if (selectedCountry !== 'ALL' && m.league?.country !== selectedCountry) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const home = m.homeTeam?.name?.toLowerCase() || '';
        const away = m.awayTeam?.name?.toLowerCase() || '';
        const league = m.league?.name?.toLowerCase() || '';
        const country = m.league?.country?.toLowerCase() || '';
        return home.includes(query) || away.includes(query) || league.includes(query) || country.includes(query);
      }

      return true;
    });
  }, [matches, selectedCountry, searchTerm]);

  // Group matches by league
  const leagueGroups = useMemo(() => {
    const groupsMap = new Map<string, LeagueGroup>();

    filteredMatches.forEach((m) => {
      const country = m.league?.country || 'International';
      const leagueName = m.league?.name || 'Other Competitions';
      const groupKey = `${country}_${leagueName}`.toUpperCase();

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          id: groupKey,
          country,
          name: leagueName,
          flag: m.league?.flag,
          matches: [],
        });
      }

      groupsMap.get(groupKey)!.matches.push(m);
    });

    return Array.from(groupsMap.values()).sort((a, b) => {
      if (a.country !== b.country) {
        return a.country.localeCompare(b.country);
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredMatches]);

  const toggleLeagueCollapse = (leagueId: string) => {
    setCollapsedLeagues((prev) => ({
      ...prev,
      [leagueId]: !prev[leagueId],
    }));
  };

  const expandAll = () => setCollapsedLeagues({});
  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    leagueGroups.forEach((g) => {
      allCollapsed[g.id] = true;
    });
    setCollapsedLeagues(allCollapsed);
  };

  return (
    <div className="space-y-5">
      {/* Controls Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            {type === 'fixtures' ? (
              <>
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Upcoming Fixtures</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Full-Time Results</span>
              </>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {type === 'fixtures'
              ? 'Official scheduled upcoming games with kick-off times'
              : 'Official completed matches, final scores, and statistics'}
          </p>
        </div>

        {/* Date Offset Selector Buttons */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          {type === 'fixtures' ? (
            <>
              <button
                onClick={() => setOffset(1)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === 1 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tomorrow (+1)
              </button>
              <button
                onClick={() => setOffset(2)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === 2 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                +2 Days
              </button>
              <button
                onClick={() => setOffset(3)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === 3 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                +3 Days
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setOffset(0)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === 0 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Today (0)
              </button>
              <button
                onClick={() => setOffset(-1)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === -1 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Yesterday (-1)
              </button>
              <button
                onClick={() => setOffset(-2)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === -2 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                -2 Days
              </button>
              <button
                onClick={() => setOffset(-3)}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  offset === -3 ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                -3 Days
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder={
              type === 'results'
                ? 'Search finished matches, teams, leagues...'
                : 'Search fixtures, teams, leagues...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Country Filter */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 w-full md:w-48 cursor-pointer"
          >
            <option value="ALL">All Countries ({countries.length})</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Expand / Collapse Controls */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            onClick={expandAll}
            className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Summary Stats Strip */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <strong className="text-white">{filteredMatches.length}</strong> {type === 'results' ? 'results' : 'fixtures'} across{' '}
          <strong className="text-white">{leagueGroups.length}</strong> leagues
        </span>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-emerald-400 hover:underline cursor-pointer"
          >
            Clear Search
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="p-16 text-center text-slate-400 flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
          <p className="text-xs">
            Fetching {type === 'results' ? 'official match results' : 'upcoming fixtures'}...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-6 text-center text-rose-300">
          <p className="text-sm font-semibold">Error loading data</p>
          <p className="text-xs text-rose-400 mt-1">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredMatches.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">No matches found for this date.</p>
          <p className="text-xs text-slate-500 mt-1">Try selecting a different date offset or clearing your search filters.</p>
        </div>
      )}

      {/* Grouped Matches by League */}
      {!loading && !error && filteredMatches.length > 0 && (
        <div className="space-y-6">
          {leagueGroups.map((group) => {
            const isCollapsed = !!collapsedLeagues[group.id];

            return (
              <div
                key={group.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Sticky League Header */}
                <div
                  onClick={() => toggleLeagueCollapse(group.id)}
                  className="sticky top-[116px] z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-850 transition-colors"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                      {group.country}
                    </span>
                    <h3 className="text-sm font-bold text-white truncate">
                      {group.name}
                    </h3>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                      {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
                    </span>
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Match Cards Grid */}
                {!isCollapsed && (
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.matches.map((m) => {
                      const isHomeWinner = type === 'results' && (m.homeScore ?? 0) > (m.awayScore ?? 0);
                      const isAwayWinner = type === 'results' && (m.awayScore ?? 0) > (m.homeScore ?? 0);

                      return (
                        <div
                          key={m.id}
                          onClick={() => onSelectMatch(m)}
                          className="bg-slate-900 border border-slate-800/90 hover:border-slate-700 hover:bg-slate-850/60 rounded-xl p-3.5 cursor-pointer transition-all flex flex-col justify-between group shadow-sm"
                        >
                          {/* Top Row: Time / Status */}
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 mb-2 border-b border-slate-800">
                            <span className="font-semibold text-slate-400 truncate max-w-[150px]">
                              {m.league.name}
                            </span>
                            <span className="font-mono text-emerald-400 flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                {type === 'results' ? (
                                  <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    <span>{m.statusText || 'FT (90\')'}</span>
                                  </span>
                                ) : m.startTime ? (
                                  new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                ) : (
                                  'Scheduled'
                                )}
                              </span>
                            </span>
                          </div>

                          {/* Teams & Scores */}
                          <div className="space-y-2 py-1">
                            {/* Home */}
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs truncate transition-colors ${
                                  isHomeWinner
                                    ? 'font-bold text-white group-hover:text-emerald-300'
                                    : 'font-medium text-slate-300 group-hover:text-white'
                                }`}
                              >
                                {m.homeTeam.name}
                              </span>
                              <span
                                className={`text-xs font-mono ${
                                  isHomeWinner
                                    ? 'font-extrabold text-emerald-400 text-sm'
                                    : 'font-bold text-slate-300'
                                }`}
                              >
                                {type === 'results' ? m.homeScore ?? 0 : '-'}
                              </span>
                            </div>

                            {/* Away */}
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs truncate transition-colors ${
                                  isAwayWinner
                                    ? 'font-bold text-white group-hover:text-emerald-300'
                                    : 'font-medium text-slate-300 group-hover:text-white'
                                }`}
                              >
                                {m.awayTeam.name}
                              </span>
                              <span
                                className={`text-xs font-mono ${
                                  isAwayWinner
                                    ? 'font-extrabold text-emerald-400 text-sm'
                                    : 'font-bold text-slate-300'
                                }`}
                              >
                                {type === 'results' ? m.awayScore ?? 0 : '-'}
                              </span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="pt-2 mt-2 border-t border-slate-800/70 flex items-center justify-between text-[10px] text-slate-500">
                            <span>{m.league.country}</span>
                            <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center">
                              {type === 'results' ? 'Stats & Events' : 'Details'} <ChevronRight className="w-3 h-3 inline ml-0.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
