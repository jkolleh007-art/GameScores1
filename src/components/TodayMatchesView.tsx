import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Globe,
  Trophy,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Radio,
  CheckCircle2,
  ListFilter,
} from 'lucide-react';
import { Match } from '../types';

interface TodayMatchesViewProps {
  matches: Match[];
  onSelectMatch: (match: Match) => void;
}

interface LeagueGroup {
  id: string;
  country: string;
  name: string;
  flag?: string;
  matches: Match[];
}

export const TodayMatchesView: React.FC<TodayMatchesViewProps> = ({
  matches,
  onSelectMatch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PLAY' | 'SCHEDULED' | 'FINISHED'>('ALL');
  const [collapsedLeagues, setCollapsedLeagues] = useState<Record<string, boolean>>({});

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

  // Filter matches based on search, country, and status
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // Status filter
      if (statusFilter === 'IN_PLAY' && m.status !== 'IN_PLAY' && m.status !== 'PAUSED') {
        return false;
      }
      if (statusFilter === 'SCHEDULED' && m.status !== 'SCHEDULED') {
        return false;
      }
      if (statusFilter === 'FINISHED' && m.status !== 'FINISHED') {
        return false;
      }

      // Country filter
      if (selectedCountry !== 'ALL' && m.league.country !== selectedCountry) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const home = m.homeTeam.name.toLowerCase();
        const away = m.awayTeam.name.toLowerCase();
        const league = m.league.name.toLowerCase();
        const country = m.league.country.toLowerCase();
        return (
          home.includes(query) ||
          away.includes(query) ||
          league.includes(query) ||
          country.includes(query)
        );
      }

      return true;
    });
  }, [matches, statusFilter, selectedCountry, searchTerm]);

  // Group filtered matches by League (country + league name)
  const groupedLeagues = useMemo(() => {
    const map = new Map<string, LeagueGroup>();

    filteredMatches.forEach((m) => {
      const country = m.league.country || 'International';
      const leagueName = m.league.name || 'Other';
      const key = `${country}:::${leagueName}`;

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          country,
          name: leagueName,
          flag: m.league.flag,
          matches: [],
        });
      }

      map.get(key)!.matches.push(m);
    });

    return Array.from(map.values()).sort((a, b) => {
      // Primary sort by country, secondary by league name
      const cComp = a.country.localeCompare(b.country);
      if (cComp !== 0) return cComp;
      return a.name.localeCompare(b.name);
    });
  }, [filteredMatches]);

  const toggleLeagueCollapse = (leagueId: string) => {
    setCollapsedLeagues((prev) => ({
      ...prev,
      [leagueId]: !prev[leagueId],
    }));
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    groupedLeagues.forEach((g) => {
      next[g.id] = true;
    });
    setCollapsedLeagues(next);
  };

  const expandAll = () => {
    setCollapsedLeagues({});
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Search Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>Today's Complete Schedule</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live scorelines and scheduled fixtures grouped by league with quick sticky navigation
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
              {filteredMatches.length} Matches
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {groupedLeagues.length} Leagues
            </span>
          </div>
        </div>

        {/* Filter Bar: Search, Country, Status, Expand/Collapse */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-1 border-t border-slate-800/80">
          {/* Search Input */}
          <div className="relative lg:col-span-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              id="today-search-input"
              type="text"
              placeholder="Search team or league..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Country Selector */}
          <div className="relative lg:col-span-3">
            <select
              id="today-country-select"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 truncate"
            >
              <option value="ALL">All Countries ({countries.length})</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Buttons */}
          <div className="lg:col-span-3 flex items-center bg-slate-950/80 border border-slate-800 p-0.5 rounded-lg">
            {(['ALL', 'IN_PLAY', 'SCHEDULED', 'FINISHED'] as const).map((st) => (
              <button
                key={st}
                id={`status-filter-${st.toLowerCase()}`}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`flex-1 py-1 text-[11px] font-semibold rounded transition-colors text-center ${
                  statusFilter === st
                    ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL'
                  ? 'All'
                  : st === 'IN_PLAY'
                  ? 'Live'
                  : st === 'SCHEDULED'
                  ? 'Upcoming'
                  : 'Finished'}
              </button>
            ))}
          </div>

          {/* Expand / Collapse All */}
          <div className="lg:col-span-2 flex items-center justify-end space-x-1.5">
            <button
              id="expand-all-leagues"
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
              title="Expand all league sections"
            >
              Expand
            </button>
            <button
              id="collapse-all-leagues"
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
              title="Collapse all league sections"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {matches.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-pulse" />
          <p className="text-sm font-semibold text-slate-300">Loading today's fixtures from Flashscore...</p>
        </div>
      ) : groupedLeagues.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <ListFilter className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">No matches matching the selected filters</p>
          <p className="text-xs text-slate-500 mt-1">Try resetting the search query, country, or status filter.</p>
        </div>
      ) : (
        /* Grouped by League with Sticky Headers */
        <div className="space-y-6">
          {groupedLeagues.map((group) => {
            const isCollapsed = Boolean(collapsedLeagues[group.id]);

            return (
              <div
                key={group.id}
                id={`league-group-${group.id.replace(/[^a-zA-Z0-9]/g, '_')}`}
                className="space-y-3"
              >
                {/* Sticky League Header */}
                <div
                  onClick={() => toggleLeagueCollapse(group.id)}
                  className="sticky top-[116px] z-20 bg-slate-900/95 backdrop-blur-md border border-slate-800/90 hover:border-slate-700 rounded-xl px-4 py-2.5 shadow-md flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
                      {group.country}
                    </span>
                    <span className="text-slate-600 shrink-0">•</span>
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                        {group.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-3">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                      {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
                    </span>
                    <button
                      type="button"
                      aria-label={isCollapsed ? 'Expand league' : 'Collapse league'}
                      className="p-1 text-slate-400 group-hover:text-slate-200 transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Match Cards Grid */}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.matches.map((m) => {
                      const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
                      const isFinished = m.status === 'FINISHED';

                      return (
                        <div
                          key={m.id}
                          id={`today-match-${m.id}`}
                          onClick={() => onSelectMatch(m)}
                          className="bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between group shadow-sm"
                        >
                          {/* Card Header: League & Status/Time */}
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 mb-2 border-b border-slate-800">
                            <span className="font-semibold text-slate-300 truncate max-w-[170px]">
                              {m.league.name}
                            </span>
                            <span
                              className={`font-mono flex items-center space-x-1 ${
                                isLive
                                  ? 'text-emerald-400 font-bold'
                                  : isFinished
                                  ? 'text-slate-400'
                                  : 'text-indigo-400'
                              }`}
                            >
                              {isLive && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block mr-0.5" />
                              )}
                              {!isLive && <Clock className="w-3 h-3" />}
                              <span>
                                {isLive
                                  ? m.statusText || `${m.minute || 1}'`
                                  : isFinished
                                  ? 'FT'
                                  : m.startTime
                                  ? new Date(m.startTime).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : 'Scheduled'}
                              </span>
                            </span>
                          </div>

                          {/* Scores & Team Names */}
                          <div className="space-y-2 py-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors truncate">
                                {m.homeTeam.name}
                              </span>
                              <span
                                className={`text-xs font-extrabold ${
                                  isLive ? 'text-emerald-400' : 'text-white'
                                }`}
                              >
                                {m.homeScore}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors truncate">
                                {m.awayTeam.name}
                              </span>
                              <span
                                className={`text-xs font-extrabold ${
                                  isLive ? 'text-emerald-400' : 'text-white'
                                }`}
                              >
                                {m.awayScore}
                              </span>
                            </div>
                          </div>

                          {/* Footer: Country & View Action */}
                          <div className="pt-2 mt-2 border-t border-slate-800/70 flex items-center justify-between text-[10px] text-slate-500">
                            <span>{m.league.country}</span>
                            <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center font-medium">
                              View <ChevronRight className="w-3 h-3 inline ml-0.5" />
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
