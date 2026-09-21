import { Match, MatchEvent, FacebookPageConfig } from '../types.js';

function getMinuteValue(eventMinute?: number, matchMinute?: number, statusText?: string): number {
  if (eventMinute && eventMinute > 0) return eventMinute;
  if (matchMinute && matchMinute > 0) return matchMinute;
  if (statusText) {
    const m = statusText.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return 1;
}

export function formatGoalPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateGoal || "⚽ GOAL! {home_team} {home_score} - {away_score} {away_team}!\n⏱️ Match Time: {minute}' min ({period})\n👤 {player}\n🏆 {league_name}\n\n#{league_tag} #LiveScores #GameScores";
  
  // If existing saved template doesn't have an explicit minute label, ensure the minute line is clear
  if (!template.includes('⏱️') && !template.includes('Match Time') && !template.includes('Minute')) {
    template = template.replace(/(⚽ GOAL![^\n]*)/, `$1\n⏱️ Match Time: {minute}' min ({period})`);
  }

  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');
  const scoreLine = `${event.homeScore ?? match.homeScore} - ${event.awayScore ?? match.awayScore}`;
  
  let playerStr = event.playerName ? `Scorer: ${event.playerName}` : 'Goal scored!';
  if (event.detail) {
    playerStr += ` (${event.detail})`;
  }
  if (event.secondaryPlayerName) {
    playerStr += ` (Assist: ${event.secondaryPlayerName})`;
  }

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{home_score}/g, String(event.homeScore ?? match.homeScore))
    .replace(/{away_score}/g, String(event.awayScore ?? match.awayScore))
    .replace(/{score}/g, scoreLine)
    .replace(/{player}/g, playerStr)
    .replace(/{minute}/g, minStr)
    .replace(/{period}/g, period)
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag);
}

export function formatYellowCardPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateYellowCard || "🟨 YELLOW CARD! {player} ({team}) booked in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #YellowCard";

  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');
  const teamName = event.teamSide === 'home' ? match.homeTeam.name : match.awayTeam.name;
  const playerName = event.playerName || 'Player';

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{team}/g, teamName)
    .replace(/{player}/g, playerName)
    .replace(/{minute}/g, minStr)
    .replace(/{period}/g, period)
    .replace(/{home_score}/g, String(event.homeScore ?? match.homeScore))
    .replace(/{away_score}/g, String(event.awayScore ?? match.awayScore))
    .replace(/{score}/g, `${match.homeScore} - ${match.awayScore}`)
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag);
}

export function formatRedCardPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateRedCard || "🟥 RED CARD! {team} player {player} sent off in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #RedCard";

  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');
  const teamName = event.teamSide === 'home' ? match.homeTeam.name : match.awayTeam.name;
  const playerName = event.playerName || 'Player';

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{team}/g, teamName)
    .replace(/{player}/g, playerName)
    .replace(/{minute}/g, minStr)
    .replace(/{period}/g, period)
    .replace(/{home_score}/g, String(event.homeScore ?? match.homeScore))
    .replace(/{away_score}/g, String(event.awayScore ?? match.awayScore))
    .replace(/{score}/g, `${match.homeScore} - ${match.awayScore}`)
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag);
}

export function formatCornerPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateCorner || "🚩 CORNER KICK! Corner awarded to {team} in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #CornerKick";

  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');
  const teamName = event.teamSide === 'home' ? match.homeTeam.name : match.awayTeam.name;

  let cornerCount = '';
  if (match.stats) {
    const cHome = match.stats.cornersHome ?? 0;
    const cAway = match.stats.cornersAway ?? 0;
    cornerCount = `Corners: ${cHome} - ${cAway}`;
  }

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{team}/g, teamName)
    .replace(/{minute}/g, minStr)
    .replace(/{period}/g, period)
    .replace(/{corner_count}/g, cornerCount)
    .replace(/{home_score}/g, String(event.homeScore ?? match.homeScore))
    .replace(/{away_score}/g, String(event.awayScore ?? match.awayScore))
    .replace(/{score}/g, `${match.homeScore} - ${match.awayScore}`)
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag);
}

export function formatKickoffPost(match: Match, config: FacebookPageConfig): string {
  const template = config.postTemplateKickoff || "⚡ MATCH KICK-OFF! (1st Half)\n{home_team} vs {away_team}\n⏱️ Match Time: Kick-Off (1')\n🏆 {league_name}\n\nStay tuned for live score updates!\n#{league_tag} #GameScores";
  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag);
}

export function formatHalfTimePost(match: Match, config: FacebookPageConfig): string {
  const template = config.postTemplateHalfTime || "⏸️ HALF-TIME: {home_team} {home_score} - {away_score} {away_team}\n⏱️ Match Time: Half-Time (45')\n🏆 {league_name}\n\n#{league_tag} #GameScores";
  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{home_score}/g, String(match.homeScore))
    .replace(/{away_score}/g, String(match.awayScore))
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag);
}

export function formatFullTimePost(match: Match, config: FacebookPageConfig): string {
  const template = config.postTemplateFullTime || "🏁 FULL-TIME: {home_team} {home_score} - {away_score} {away_team}\n⏱️ Match Time: Full-Time (90')\n🏆 {league_name}\n{stats_summary}\n\nThanks for following!\n#{league_tag} #GameScores";
  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');
  
  let statsSummary = '';
  if (config.includeStatsInFullTime && match.stats) {
    const s = match.stats;
    const lines = [];
    if (s.possessionHome !== undefined && s.possessionAway !== undefined) {
      lines.push(`Possession: ${s.possessionHome}% - ${s.possessionAway}%`);
    }
    if (s.shotsOnTargetHome !== undefined && s.shotsOnTargetAway !== undefined) {
      lines.push(`Shots on Target: ${s.shotsOnTargetHome} - ${s.shotsOnTargetAway}`);
    }
    if (s.cornersHome !== undefined && s.cornersAway !== undefined) {
      lines.push(`Corners: ${s.cornersHome} - ${s.cornersAway}`);
    }
    if (lines.length > 0) {
      statsSummary = `\n📊 Match Stats:\n${lines.join('\n')}`;
    }
  }

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{home_score}/g, String(match.homeScore))
    .replace(/{away_score}/g, String(match.awayScore))
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag)
    .replace(/{stats_summary}/g, statsSummary);
}

export function formatLiveRoundupPost(matches: Match[], config: FacebookPageConfig): string {
  if (!matches || matches.length === 0) {
    return '⚽ LIVE SCORES UPDATE\nNo active live matches currently in progress.\n#LiveScores #Football';
  }

  // Filter strictly by target leagues if configured
  let filteredMatches = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filteredMatches = matches.filter(m => config.targetLeagueIds.includes(m.league.id));
  } else {
    filteredMatches = []; // If no leagues are selected for today, do not include unselected leagues
  }

  // Group matches by league
  const leagueGroups = new Map<string, Match[]>();
  for (const m of filteredMatches) {
    const lName = m.league?.name || 'International / Other';
    if (!leagueGroups.has(lName)) {
      leagueGroups.set(lName, []);
    }
    leagueGroups.get(lName)!.push(m);
  }

  const leagueSections: string[] = [];
  const tagsSet = new Set<string>();

  for (const [leagueName, lMatches] of leagueGroups.entries()) {
    const matchLines = lMatches.map(m => {
      // 1. Minute / Stage display
      let timeBadge = '';
      const stLower = (m.statusText || '').toLowerCase().trim();
      const isHalftime =
        m.status === 'PAUSED' ||
        stLower === 'ht' ||
        stLower === 'half time' ||
        stLower === 'halftime' ||
        stLower === 'half-time' ||
        stLower.startsWith('ht ') ||
        stLower.endsWith(' ht');

      if (isHalftime && !stLower.includes('1st') && !stLower.includes('2nd')) {
        timeBadge = '⏸️ HT (45\')';
      } else if (m.minute) {
        const periodStr = m.statusText?.includes('2nd') ? ' • 2nd Half' : m.statusText?.includes('1st') ? ' • 1st Half' : '';
        timeBadge = `⏱️ ${m.minute}'${periodStr}`;
      } else {
        timeBadge = `⏱️ ${m.statusText || 'LIVE'}`;
      }

      // 2. Stats (Cards & Corners)
      const stats = m.stats || {};
      const events = m.events || [];

      // Corners
      const cHome = stats.cornersHome ?? 0;
      const cAway = stats.cornersAway ?? 0;

      // Yellow cards (from stats or event list)
      const evYellowHome = events.filter(e => e.teamSide === 'home' && e.type === 'YELLOW_CARD').length;
      const evYellowAway = events.filter(e => e.teamSide === 'away' && e.type === 'YELLOW_CARD').length;
      const yHome = stats.yellowCardsHome ?? evYellowHome;
      const yAway = stats.yellowCardsAway ?? evYellowAway;

      // Red cards (from stats or event list)
      const evRedHome = events.filter(e => e.teamSide === 'home' && (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD')).length;
      const evRedAway = events.filter(e => e.teamSide === 'away' && (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD')).length;
      const rHome = stats.redCardsHome ?? evRedHome;
      const rAway = stats.redCardsAway ?? evRedAway;

      const statBadges: string[] = [
        `🚩 Corners: ${cHome}-${cAway}`,
        `🟨 Cards: ${yHome}-${yAway}`,
      ];

      if (rHome > 0 || rAway > 0) {
        statBadges.push(`🟥 Red: ${rHome}-${rAway}`);
      }

      return `• ${m.homeTeam.name} ${m.homeScore} - ${m.awayScore} ${m.awayTeam.name} (${timeBadge})\n  ↳ ${statBadges.join(' | ')}`;
    });

    const cleanTag = leagueName.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanTag && cleanTag.length < 24) {
      tagsSet.add(`#${cleanTag}`);
    }

    leagueSections.push(`🏆 ${leagueName}\n${matchLines.join('\n')}`);
  }

  const matchesList = leagueSections.join('\n\n');
  const now = new Date();
  const tz = config.timezone || 'UTC';
  let timeStr = '';
  try {
    timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: 'short',
    });
  } catch {
    // Fallback if timezone string is invalid
    timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
  }

  const hashtags = Array.from(tagsSet).slice(0, 5).join(' ');

  const defaultTemplate =
    "⚽ LIVE MATCHES SCOREBOARD ⏱️\n📊 {count} Active Match(es) in Progress ({time})\n\n{matches_list}\n\n⚡ Follow for live scores and breaking goal updates!\n{hashtags} #LiveScores #GameScores";

  const template = config.postTemplateRoundup || defaultTemplate;

  return template
    .replace(/{count}/g, String(filteredMatches.length))
    .replace(/{time}/g, timeStr)
    .replace(/{matches_list}/g, matchesList)
    .replace(/{hashtags}/g, hashtags);
}

export function formatResultsRoundupPost(matches: Match[], config: FacebookPageConfig): string {
  if (!matches || matches.length === 0) {
    return '🏁 FULL-TIME RESULTS ⚽\nNo new completed matches to report.\n#Results #FullTime #GameScores';
  }

  // Filter strictly by target leagues if configured
  let filtered = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filtered = matches.filter(m => config.targetLeagueIds.includes(m.league.id));
  } else {
    filtered = []; // If no leagues are selected for today, do not include unselected leagues
  }

  // Group by league
  const leagueGroups = new Map<string, Match[]>();
  for (const m of filtered) {
    const lName = m.league?.name || 'International / Other';
    if (!leagueGroups.has(lName)) {
      leagueGroups.set(lName, []);
    }
    leagueGroups.get(lName)!.push(m);
  }

  const leagueSections: string[] = [];
  const tagsSet = new Set<string>();

  for (const [leagueName, lMatches] of leagueGroups.entries()) {
    const matchLines = lMatches.map(m => {
      let statsLine = '';
      if (config.includeStatsInFullTime && m.stats) {
        const parts = [];
        if (m.stats.shotsOnTargetHome !== undefined && m.stats.shotsOnTargetAway !== undefined) {
          parts.push(`🎯 Shots on Target: ${m.stats.shotsOnTargetHome}-${m.stats.shotsOnTargetAway}`);
        }
        if (m.stats.cornersHome !== undefined && m.stats.cornersAway !== undefined) {
          parts.push(`🚩 Corners: ${m.stats.cornersHome}-${m.stats.cornersAway}`);
        }
        if (parts.length > 0) {
          statsLine = `\n  ↳ ${parts.join(' | ')}`;
        }
      }
      return `• ${m.homeTeam.name} ${m.homeScore} - ${m.awayScore} ${m.awayTeam.name} (🏁 FT)${statsLine}`;
    });

    const cleanTag = leagueName.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanTag && cleanTag.length < 24) {
      tagsSet.add(`#${cleanTag}`);
    }

    leagueSections.push(`🏆 ${leagueName}\n${matchLines.join('\n')}`);
  }

  const matchesList = leagueSections.join('\n\n');
  const now = new Date();
  const tz = config.timezone || 'UTC';
  let timeStr = '';
  try {
    timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: 'short',
    });
  } catch {
    timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
  }

  const hashtags = Array.from(tagsSet).slice(0, 5).join(' ');

  const defaultTemplate = `🏁 FULL-TIME RESULTS ⚽\n📊 {count} Completed Match(es) Grouped by League ({time})\n\n{matches_list}\n\nThanks for following today's action!\n{hashtags} #FullTime #Results #GameScores`;
  const template = config.postTemplateFullTimeRoundup?.trim() || defaultTemplate;

  return template
    .replace(/{count}/g, String(filtered.length))
    .replace(/{time}/g, timeStr)
    .replace(/{matches_list}/g, matchesList)
    .replace(/{hashtags}/g, hashtags);
}

