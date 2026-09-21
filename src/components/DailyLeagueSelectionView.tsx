import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Clock,
  AlertTriangle,
  Shield,
  Check,
  X,
  Globe,
  Sparkles,
  Layers,
  ArrowRight,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { DailyLeagueSelection, SystemStatus } from '../types';

export interface AvailableLeagueItem {
  id: string;
  name: string;
  country: string;
  flag?: string;
  totalCount: number;
  liveCount: number;
  todayCount: number;
  isSelected?: boolean;
}

interface DailyLeagueSelectionViewProps {
  onSelectionSaved?: (selection: DailyLeagueSelection) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const DailyLeagueSelectionView: React.FC<DailyLeagueSelectionViewProps> = ({
  onSelectionSaved,
  onNavigateToTab,
}) => {
  const [dailySelection, setDailySelection] = useState<DailyLeagueSelection | null>(null);
  const [availableLeagues, setAvailableLeagues] = useState<AvailableLeagueItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedNamesMap, setSelectedNamesMap] = useState<Map<string, string>>(new Map());
  const [currentDate, setCurrentDate] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('UTC');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isSelectingAll, setIsSelectingAll] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [filterMode, setFilterMode] = useState<'all' | 'selected' | 'live' | 'today'>('all');
  const [feedbackNotice, setFeedbackNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Fetch daily selection status and leagues from server
  const fetchSelectionData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/leagues/daily-selection');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setDailySelection(json.data);
        setCurrentDate(json.currentDate || json.data?.date || new Date().toISOString().split('T')[0]);
        setTimezone(json.timezone || 'UTC');

        const ids: string[] = json.data?.selectedLeagueIds || [];
        setSelectedIds(ids);

        const leagues: AvailableLeagueItem[] = json.availableLeagues || [];
        setAvailableLeagues(leagues);

        const nameMap = new Map<string, string>();
        for (const l of leagues) {
          nameMap.set(l.id, l.name);
        }
        // Also map names already in daily selection
        if (json.data?.selectedLeagueNames && json.data.selectedLeagueNames.length === ids.length) {
          ids.forEach((id: string, idx: number) => {
            if (!nameMap.has(id)) {
              nameMap.set(id, json.data.selectedLeagueNames[idx]);
            }
          });
        }
        setSelectedNamesMap(nameMap);
      }
    } catch (e: any) {
      console.warn('Error loading daily leagues:', e);
      setFeedbackNotice({
        type: 'error',
        message: e.message || 'Failed to load league directory',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSelectionData();
  }, [fetchSelectionData]);

  // Extract unique countries
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const l of availableLeagues) {
      if (l.country) set.add(l.country);
    }
    return Array.from(set).sort();
  }, [availableLeagues]);

  // Toggle individual league
  const handleToggleLeague = (league: AvailableLeagueItem) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(league.id);
      let updated: string[];
      if (exists) {
        updated = prev.filter((id) => id !== league.id);
      } else {
        updated = [...prev, league.id];
      }
      setSelectedNamesMap((prevMap) => {
        const nextMap = new Map(prevMap);
        if (exists) {
          // keep or remove
        } else {
          nextMap.set(league.id, league.name);
        }
        return nextMap;
      });
      return updated;
    });
  };

  // Remove single league from selected dock
  const handleRemoveLeagueId = (id: string) => {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  // Save current selection to server
  const handleSaveSelection = async () => {
    setIsSaving(true);
    setFeedbackNotice(null);
    try {
      const selectedNames = selectedIds.map(
        (id) => selectedNamesMap.get(id) || availableLeagues.find((l) => l.id === id)?.name || id
      );

      const res = await fetch('/api/leagues/daily-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedLeagueIds: selectedIds,
          selectedLeagueNames: selectedNames,
          allLeaguesSelected:
            availableLeagues.length > 0 && selectedIds.length === availableLeagues.length,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save daily league selection');
      }

      setDailySelection(json.data);
      setFeedbackNotice({
        type: 'success',
        message: `Saved! Today's game filter is active for ${selectedIds.length} league(s) on ${json.data?.date}. Games from unselected leagues will not be posted or displayed.`,
      });

      if (onSelectionSaved && json.data) {
        onSelectionSaved(json.data);
      }
    } catch (e: any) {
      setFeedbackNotice({
        type: 'error',
        message: e.message || 'Error saving league selection',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset / Clear all leagues for today
  const handleReset = async () => {
    setIsResetting(true);
    setFeedbackNotice(null);
    try {
      const res = await fetch('/api/leagues/daily-selection/reset', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to reset daily league selection');
      }

      setSelectedIds([]);
      setDailySelection(json.data);
      setFeedbackNotice({
        type: 'info',
        message: `Cleared all league selections for today (${json.data?.date}). No games will be displayed or posted until leagues are selected.`,
      });

      if (onSelectionSaved && json.data) {
        onSelectionSaved(json.data);
      }
    } catch (e: any) {
      setFeedbackNotice({
        type: 'error',
        message: e.message || 'Error resetting league selection',
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Select all available leagues for today
  const handleSelectAll = async () => {
    setIsSelectingAll(true);
    setFeedbackNotice(null);
    try {
      const res = await fetch('/api/leagues/daily-selection/select-all', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to select all leagues');
      }

      const allIds = json.data?.selectedLeagueIds || [];
      setSelectedIds(allIds);
      setDailySelection(json.data);

      const nameMap = new Map<string, string>();
      for (const l of availableLeagues) {
        nameMap.set(l.id, l.name);
      }
      setSelectedNamesMap(nameMap);

      setFeedbackNotice({
        type: 'success',
        message: `All ${allIds.length} available league(s) selected for today (${json.data?.date}). All active games will be eligible for display and posting.`,
      });

      if (onSelectionSaved && json.data) {
        onSelectionSaved(json.data);
      }
    } catch (e: any) {
      setFeedbackNotice({
        type: 'error',
        message: e.message || 'Error selecting all leagues',
      });
    } finally {
      setIsSelectingAll(false);
    }
  };

  // Quick preset: Select Top European Competitions
  const handleSelectPopularLeagues = () => {
    const popularKeywords = [
      'premier league',
      'champions league',
      'la liga',
      'serie a',
      'bundesliga',
      'ligue 1',
      'europa league',
      'world cup',
      'euro',
    ];

    const matchedIds: string[] = [];
    const updatedNameMap = new Map(selectedNamesMap);

    availableLeagues.forEach((l) => {
      const lower = l.name.toLowerCase();
      if (popularKeywords.some((keyword) => lower.includes(keyword))) {
        matchedIds.push(l.id);
        updatedNameMap.set(l.id, l.name);
      }
    });

    if (matchedIds.length === 0) {
      // If none matched by keyword, select the first 10 with highest match counts
      const topLeagues = [...availableLeagues]
        .sort((a, b) => b.totalCount - a.totalCount)
        .slice(0, 10);
      topLeagues.forEach((l) => {
        matchedIds.push(l.id);
        updatedNameMap.set(l.id, l.name);
      });
    }

    setSelectedIds(matchedIds);
    setSelectedNamesMap(updatedNameMap);
    setFeedbackNotice({
      type: 'info',
      message: `Selected ${matchedIds.length} major league(s). Click "Save Selection" to activate for today.`,
    });
  };

  // Filtered leagues according to search, country, and filterMode
  const filteredLeagues = useMemo(() => {
    return availableLeagues.filter((l) => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = l.name.toLowerCase().includes(term);
        const matchesCountry = l.country?.toLowerCase().includes(term);
        if (!matchesName && !matchesCountry) return false;
      }

      // Country filter
      if (selectedCountry !== 'ALL' && l.country !== selectedCountry) {
        return false;
      }

      // Filter Mode
      if (filterMode === 'selected' && !selectedIds.includes(l.id)) {
        return false;
      }
      if (filterMode === 'live' && l.liveCount === 0) {
        return false;
      }
      if (filterMode === 'today' && l.todayCount === 0 && l.liveCount === 0) {
        return false;
      }

      return true;
    });
  }, [availableLeagues, searchTerm, selectedCountry, filterMode, selectedIds]);

  const hasUnsavedChanges = useMemo(() => {
    if (!dailySelection) return selectedIds.length > 0;
    const serverIds = dailySelection.selectedLeagueIds || [];
    if (serverIds.length !== selectedIds.length) return true;
    const serverSet = new Set(serverIds);
    return selectedIds.some((id) => !serverSet.has(id));
  }, [dailySelection, selectedIds]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Explanatory Rules Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-white">Daily League Selection</h2>
                <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>Today: {currentDate || 'Active Day'}</span>
                </span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                    selectedIds.length > 0
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {selectedIds.length > 0
                    ? `${selectedIds.length} League(s) Selected`
                    : 'No Leagues Selected (Strict Blackout)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                Choose the leagues the app and Facebook publisher are permitted to post and display for today.
                Games from all unselected leagues are <strong>strictly hidden and prevented from publishing</strong>.
              </p>
            </div>
          </div>

          {/* Quick Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              id="refresh-leagues-btn"
              onClick={fetchSelectionData}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-all border border-slate-700"
              title="Refresh available leagues from Flashscore and backend"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              id="select-all-leagues-btn"
              onClick={handleSelectAll}
              disabled={isSelectingAll || availableLeagues.length === 0}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm disabled:opacity-50"
              title="Select all available leagues for today"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isSelectingAll ? 'Selecting All...' : 'Select All Leagues'}</span>
            </button>

            <button
              id="save-daily-selection-btn"
              onClick={handleSaveSelection}
              disabled={isSaving}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                  : 'bg-emerald-700/80 hover:bg-emerald-600 text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}</span>
            </button>
          </div>
        </div>

        {/* 24-Hour Scope Rule Banner */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start space-x-2 text-slate-300">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-semibold">Current Day Only</strong>
              <span>Applies exclusively to matches on {currentDate}. Resets at midnight ({timezone}).</span>
            </div>
          </div>

          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start space-x-2 text-slate-300">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-semibold">Strict Publishing Blackout</strong>
              <span>Games from unselected leagues will never be enqueued, posted, or displayed.</span>
            </div>
          </div>

          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 flex items-start space-x-2 text-slate-300">
            <RotateCcw className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-semibold">Automatic Daily Rollover</strong>
              <span>When a new day begins, yesterday&apos;s selection clears so you start fresh each day.</span>
            </div>
          </div>
        </div>

        {/* Notice Message */}
        {feedbackNotice && (
          <div
            className={`mt-4 p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              feedbackNotice.type === 'success'
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                : feedbackNotice.type === 'error'
                ? 'bg-rose-950/40 text-rose-300 border-rose-800/50'
                : 'bg-indigo-950/40 text-indigo-300 border-indigo-800/50'
            }`}
          >
            {feedbackNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : feedbackNotice.type === 'error' ? (
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <Info className="w-4 h-4 shrink-0 text-indigo-400" />
            )}
            <span className="flex-1 font-medium">{feedbackNotice.message}</span>
            <button
              onClick={() => setFeedbackNotice(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Currently Selected Leagues Dock / Chips Display */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Currently Selected Leagues ({selectedIds.length})
            </h3>
            {hasUnsavedChanges && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                Unsaved Changes
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSelectPopularLeagues}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 transition-colors"
              title="Select major European leagues"
            >
              ✨ Select Top European Competitions
            </button>

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 transition-colors"
                title="Deselect all leagues for today"
              >
                {isResetting ? 'Clearing...' : 'Clear All (Reset)'}
              </button>
            )}
          </div>
        </div>

        {selectedIds.length === 0 ? (
          <div className="p-6 text-center rounded-lg bg-slate-950/60 border border-dashed border-slate-800 text-slate-400 text-xs space-y-1">
            <AlertTriangle className="w-6 h-6 mx-auto text-amber-400 mb-1" />
            <p className="font-semibold text-slate-300">
              No leagues are currently selected for today ({currentDate}).
            </p>
            <p className="text-slate-500 max-w-md mx-auto text-[11px]">
              The app is in blackout mode: matches from unselected leagues will not appear in live score feeds,
              today&apos;s schedule, or automated Facebook roundup posts. Click the checkboxes below to select leagues.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
            {selectedIds.map((id) => {
              const leagueObj = availableLeagues.find((l) => l.id === id);
              const name = selectedNamesMap.get(id) || leagueObj?.name || id;
              const country = leagueObj?.country || '';

              return (
                <div
                  key={id}
                  className="bg-slate-950 hover:bg-slate-800 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 flex items-center space-x-2 transition-colors group"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="font-medium text-white">{name}</span>
                  {country && <span className="text-[10px] text-slate-400">({country})</span>}
                  <button
                    type="button"
                    onClick={() => handleRemoveLeagueId(id)}
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors"
                    title={`Remove ${name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Save button bar */}
        {hasUnsavedChanges && (
          <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
            <span className="text-xs text-amber-400 font-medium flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>You have modified your league selection. Click Save to apply for today.</span>
            </span>
            <button
              onClick={handleSaveSelection}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-950/30"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Apply & Save For Today'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Available Leagues Directory & Selection Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Available Leagues Directory ({availableLeagues.length})
            </h3>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                id="search-leagues-input"
                placeholder="Search league or country..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Country Selector */}
            <select
              id="filter-country-select"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Countries ({countries.length})</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Filter mode chips */}
            <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterMode === 'all'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({availableLeagues.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('selected')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterMode === 'selected'
                    ? 'bg-emerald-600/40 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Selected ({selectedIds.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('live')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterMode === 'live'
                    ? 'bg-rose-600/40 text-rose-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🔴 In-Play
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('today')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterMode === 'today'
                    ? 'bg-indigo-600/40 text-indigo-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                📅 Today
              </button>
            </div>
          </div>
        </div>

        {/* Directory Grid */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            <span>Loading leagues and active match schedule...</span>
          </div>
        ) : filteredLeagues.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
            No leagues match your filter. Try adjusting your search or country criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredLeagues.map((league) => {
              const isSelected = selectedIds.includes(league.id);

              return (
                <div
                  key={league.id}
                  id={`league-card-${league.id}`}
                  onClick={() => handleToggleLeague(league)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                    isSelected
                      ? 'bg-emerald-950/20 border-emerald-500/50 hover:border-emerald-400 shadow-sm'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-slate-700 bg-slate-900 group-hover:border-slate-500'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    {/* League Info */}
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-xs text-white truncate max-w-[190px]">
                          {league.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {league.country || 'World'}
                      </div>
                    </div>
                  </div>

                  {/* Match Count Badges */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {league.liveCount > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center space-x-1"
                        title={`${league.liveCount} match(es) currently live`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                        <span>{league.liveCount} LIVE</span>
                      </span>
                    )}

                    {league.todayCount > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700"
                        title={`${league.todayCount} match(es) scheduled today`}
                      >
                        {league.todayCount} today
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info & shortcuts */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Showing <strong>{filteredLeagues.length}</strong> of <strong>{availableLeagues.length}</strong> available leagues.
            Click any row to toggle its daily selection.
          </div>

          <div className="flex items-center space-x-2">
            {onNavigateToTab && (
              <button
                type="button"
                onClick={() => onNavigateToTab('live')}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 underline"
              >
                <span>View Live Matches</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
