import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Trophy,
  Activity,
  Share2,
  BarChart2,
  ListOrdered,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
} from 'lucide-react';
import { Match, MatchEvent, MatchStats } from '../types';
import { getMatchTimeDisplay } from './LiveMatchesView';

interface MatchDetailModalProps {
  match: Match | null;
  onClose: () => void;
  onPublishToFacebook: (match: Match, eventType: string, customMessage?: string) => Promise<void>;
  isFbConnected: boolean;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  onClose,
  onPublishToFacebook,
  isFbConnected,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'events' | 'stats' | 'facebook'>('events');
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [customPostMessage, setCustomPostMessage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!match) return;
    setLoadingDetails(true);
    setPublishFeedback(null);

    const timeInfo = getMatchTimeDisplay(match);

    // Generate default social post text with explicit match minute
    const defaultText = `⚽ LIVE SCORE UPDATE\n${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}\n⏱️ Match Time: ${timeInfo.minuteStr} (${timeInfo.periodStr})\n🏆 ${match.league.name} (${match.league.country})\n#LiveScores #Football #GameScores`;
    setCustomPostMessage(defaultText);

    fetch(`/api/matches/${match.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          if (Array.isArray(json.data.events)) setEvents(json.data.events);
          if (json.data.stats) setStats(json.data.stats);
        }
      })
      .catch((e) => console.warn('Error fetching match details:', e))
      .finally(() => setLoadingDetails(false));
  }, [match]);

  if (!match) return null;

  const handleSendPost = async (eventType = 'STATUS_CHANGE') => {
    setIsPublishing(true);
    setPublishFeedback(null);
    try {
      await onPublishToFacebook(match, eventType, customPostMessage);
      setPublishFeedback({ type: 'success', text: 'Post successfully enqueued for Facebook publishing!' });
    } catch (e: any) {
      setPublishFeedback({ type: 'error', text: e.message || 'Failed to enqueue post.' });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="bg-slate-800/80 px-5 py-3 border-b border-slate-700/70 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400">{match.league.country}</span>
            <span>•</span>
            <span className="text-emerald-400">{match.league.name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scoreline Hero Card */}
        <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 border-b border-slate-800 text-center">
          {(() => {
            const timeInfo = getMatchTimeDisplay(match);
            return (
              <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-4 shadow-sm">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span className="font-mono">{timeInfo.minuteStr}</span>
                <span className="text-slate-400">•</span>
                <span className="text-emerald-300 font-semibold">{timeInfo.periodStr}</span>
              </div>
            );
          })()}

          <div className="grid grid-cols-12 items-center gap-3">
            {/* Home Team */}
            <div className="col-span-5 text-right">
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{match.homeTeam.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Home</p>
            </div>

            {/* Score */}
            <div className="col-span-2 flex justify-center">
              <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-700 text-2xl sm:text-3xl font-black tracking-wider text-emerald-400 shadow-inner">
                {match.homeScore} - {match.awayScore}
              </div>
            </div>

            {/* Away Team */}
            <div className="col-span-5 text-left">
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{match.awayTeam.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Away</p>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 space-x-2 text-xs">
          <button
            onClick={() => setActiveSubTab('events')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-semibold border-b-2 transition-colors ${
              activeSubTab === 'events'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Incidents & Timeline ({events.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('stats')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-semibold border-b-2 transition-colors ${
              activeSubTab === 'stats'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Statistics</span>
          </button>

          <button
            onClick={() => setActiveSubTab('facebook')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 font-semibold border-b-2 transition-colors ${
              activeSubTab === 'facebook'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Facebook Publisher</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loadingDetails && (
            <div className="py-8 text-center text-slate-400 flex flex-col items-center">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mb-2" />
              <p className="text-xs">Loading detailed match feeds from Flashscore...</p>
            </div>
          )}

          {/* Events / Incidents Timeline */}
          {activeSubTab === 'events' && !loadingDetails && (
            <div className="space-y-3">
              {events.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No match events recorded yet for this game.
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((ev) => {
                    const isHome = ev.teamSide === 'home';
                    const isGoal = ev.type === 'GOAL';
                    const isRed = ev.type === 'RED_CARD' || ev.type === 'YELLOW_RED_CARD';
                    const isYellow = ev.type === 'YELLOW_CARD';
                    const isSub = ev.type === 'SUBSTITUTION';

                    return (
                      <div
                        key={ev.id}
                        className={`flex items-center p-2.5 rounded-lg border text-xs ${
                          isGoal
                            ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                            : isRed
                            ? 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                            : isYellow
                            ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                            : 'bg-slate-800/40 border-slate-700/50 text-slate-300'
                        }`}
                      >
                        {/* Minute */}
                        <span className="w-12 font-bold font-mono text-slate-400">
                          {ev.minute}'{ev.extraMinute ? `+${ev.extraMinute}` : ''}
                        </span>

                        {/* Event Icon/Type */}
                        <span className="w-24 font-semibold">
                          {isGoal && '⚽ Goal'}
                          {isYellow && '🟨 Yellow'}
                          {isRed && '🟥 Red Card'}
                          {isSub && '🔄 Sub'}
                          {!isGoal && !isYellow && !isRed && !isSub && ev.type}
                        </span>

                        {/* Player name & details */}
                        <div className="flex-1">
                          <span className="font-bold text-white">{ev.playerName}</span>
                          {ev.detail && <span className="text-[11px] text-slate-400 ml-1.5">({ev.detail})</span>}
                          {ev.homeScore !== undefined && ev.awayScore !== undefined && (
                            <span className="ml-2 font-mono font-extrabold text-emerald-400">
                              [{ev.homeScore} - {ev.awayScore}]
                            </span>
                          )}
                        </div>

                        {/* Team side badge */}
                        <span className="text-[10px] uppercase font-bold text-slate-500 px-2 py-0.5 rounded bg-slate-900">
                          {isHome ? match.homeTeam.name : match.awayTeam.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Statistics Comparison */}
          {activeSubTab === 'stats' && !loadingDetails && (
            <div className="space-y-4">
              {!stats || Object.keys(stats).length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Official live statistics are not published yet for this match tier.
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  {/* Possession */}
                  {stats.possessionHome !== undefined && (
                    <StatBar
                      label="Ball Possession"
                      homeVal={`${stats.possessionHome}%`}
                      awayVal={`${stats.possessionAway}%`}
                      homePct={stats.possessionHome}
                    />
                  )}

                  {/* Total Shots */}
                  {stats.shotsHome !== undefined && (
                    <StatBar
                      label="Total Shots"
                      homeVal={String(stats.shotsHome)}
                      awayVal={String(stats.shotsAway)}
                      homePct={((stats.shotsHome || 0) / ((stats.shotsHome || 0) + (stats.shotsAway || 1))) * 100}
                    />
                  )}

                  {/* Shots on Target */}
                  {stats.shotsOnTargetHome !== undefined && (
                    <StatBar
                      label="Shots on Target"
                      homeVal={String(stats.shotsOnTargetHome)}
                      awayVal={String(stats.shotsOnTargetAway)}
                      homePct={
                        ((stats.shotsOnTargetHome || 0) /
                          ((stats.shotsOnTargetHome || 0) + (stats.shotsOnTargetAway || 1))) *
                        100
                      }
                    />
                  )}

                  {/* Corners */}
                  {stats.cornersHome !== undefined && (
                    <StatBar
                      label="Corner Kicks"
                      homeVal={String(stats.cornersHome)}
                      awayVal={String(stats.cornersAway)}
                      homePct={
                        ((stats.cornersHome || 0) / ((stats.cornersHome || 0) + (stats.cornersAway || 1))) * 100
                      }
                    />
                  )}

                  {/* Fouls */}
                  {stats.foulsHome !== undefined && (
                    <StatBar
                      label="Fouls"
                      homeVal={String(stats.foulsHome)}
                      awayVal={String(stats.foulsAway)}
                      homePct={
                        ((stats.foulsHome || 0) / ((stats.foulsHome || 0) + (stats.foulsAway || 1))) * 100
                      }
                    />
                  )}

                  {/* Yellow Cards */}
                  {stats.yellowCardsHome !== undefined && (
                    <StatBar
                      label="Yellow Cards"
                      homeVal={String(stats.yellowCardsHome)}
                      awayVal={String(stats.yellowCardsAway)}
                      homePct={
                        ((stats.yellowCardsHome || 0) /
                          ((stats.yellowCardsHome || 0) + (stats.yellowCardsAway || 1))) *
                        100
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Facebook Publish Tab */}
          {activeSubTab === 'facebook' && (
            <div className="space-y-4">
              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-4">
                <div className="flex items-center space-x-2 text-indigo-300 font-semibold text-xs mb-2">
                  <Share2 className="w-4 h-4" />
                  <span>Facebook Page Post Generator</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Preview or customize the live update post to publish to your connected Facebook Page via Meta Graph API v22.0.
                </p>
              </div>

              {/* Editable Post Content */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Post Message Content</label>
                <textarea
                  rows={6}
                  value={customPostMessage}
                  onChange={(e) => setCustomPostMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Feedback Alert */}
              {publishFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                    publishFeedback.type === 'success'
                      ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/50 border-rose-800 text-rose-300'
                  }`}
                >
                  {publishFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{publishFeedback.text}</span>
                </div>
              )}

              {/* Quick Trigger Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400 text-[11px]">Quick Templates:</span>
                  <button
                    onClick={() =>
                      setCustomPostMessage(
                        `⚽ GOAL! ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}!\n🏆 ${match.league.name}\n#LiveScores`
                      )
                    }
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                  >
                    Goal
                  </button>
                  <button
                    onClick={() =>
                      setCustomPostMessage(
                        `🏁 FULL-TIME: ${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}\n🏆 ${match.league.name}\n#FullTime`
                      )
                    }
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                  >
                    Full-Time
                  </button>
                </div>

                <button
                  id="publish-to-facebook-btn"
                  onClick={() => handleSendPost('CUSTOM')}
                  disabled={isPublishing || !customPostMessage.trim()}
                  className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md active:scale-95"
                >
                  <Send className={`w-3.5 h-3.5 ${isPublishing ? 'animate-bounce' : ''}`} />
                  <span>{isPublishing ? 'Enqueuing...' : 'Publish to Facebook Page'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function StatBar({
  label,
  homeVal,
  awayVal,
  homePct,
}: {
  label: string;
  homeVal: string;
  awayVal: string;
  homePct: number;
}) {
  const boundedPct = Math.max(5, Math.min(95, homePct || 50));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-slate-400 text-[11px] font-medium">
        <span className="text-white font-bold">{homeVal}</span>
        <span>{label}</span>
        <span className="text-white font-bold">{awayVal}</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${boundedPct}%` }} />
        <div className="bg-blue-500 h-full transition-all" style={{ width: `${100 - boundedPct}%` }} />
      </div>
    </div>
  );
}
