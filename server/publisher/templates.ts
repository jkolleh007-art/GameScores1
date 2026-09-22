import { Match, MatchEvent, FacebookPageConfig, League } from '../types.js';

/**
 * Convert numbers/digits to Mathematical Bold Unicode digits
 * '0' -> '𝟎', '1' -> '𝟏', '2' -> '𝟐', ..., '9' -> '𝟗'
 */
export function toBoldUnicodeDigits(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const boldDigits: Record<string, string> = {
    '0': '𝟎',
    '1': '𝟏',
    '2': '𝟐',
    '3': '𝟑',
    '4': '𝟒',
    '5': '𝟓',
    '6': '𝟔',
    '7': '𝟕',
    '8': '𝟖',
    '9': '𝟗',
  };
  return String(val).replace(/[0-9]/g, (d) => boldDigits[d] || d);
}

/**
 * Standard scoreboard legend footer requested by user
 */
export const SCOREBOARD_LEGEND = `━━━━━━━━━━━━━━━━
🕒 Added time
⛳ Corner kicks
🎯 Shots on target
🏹 Total shots
🅿️ Ball possesion
🟥 Red cards
🔁 Substitutions
🟨 Yellow cards
⚖️ Penalties
━━━━━━━━━━━━━━━━`;

/**
 * Resolves country flag emoji from ISO code or country name
 */
export function getCountryFlag(countryName?: string, countryCode?: string): string {
  if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
    const code = countryCode.toUpperCase();
    if (code === 'EN') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
    if (code === 'WA') return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
    if (code === 'SC') return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
    const first = 0x1F1E6 + (code.charCodeAt(0) - 65);
    const second = 0x1F1E6 + (code.charCodeAt(1) - 65);
    return String.fromCodePoint(first, second);
  }

  if (!countryName) return '🌍';
  const cLower = countryName.toLowerCase().trim();

  const flags: Record<string, string> = {
    uzbekistan: '🇺🇿',
    paraguay: '🇵🇾',
    botswana: '🇧🇼',
    malawi: '🇲🇼',
    england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    spain: '🇪🇸',
    italy: '🇮🇹',
    germany: '🇩🇪',
    france: '🇫🇷',
    brazil: '🇧🇷',
    argentina: '🇦🇷',
    portugal: '🇵🇹',
    netherlands: '🇳🇱',
    belgium: '🇧🇪',
    turkey: '🇹🇷',
    'saudi arabia': '🇸🇦',
    usa: '🇺🇸',
    'united states': '🇺🇸',
    mexico: '🇲🇽',
    japan: '🇯🇵',
    'south korea': '🇰🇷',
    korea: '🇰🇷',
    australia: '🇦🇺',
    morocco: '🇲🇦',
    egypt: '🇪🇬',
    nigeria: '🇳🇬',
    'south africa': '🇿🇦',
    colombia: '🇨🇴',
    chile: '🇨🇱',
    uruguay: '🇺🇾',
    ecuador: '🇪🇨',
    peru: '🇵🇪',
    sweden: '🇸🇪',
    norway: '🇳🇴',
    denmark: '🇩🇰',
    finland: '🇫🇮',
    switzerland: '🇨🇭',
    austria: '🇦🇹',
    poland: '🇵🇱',
    croatia: '🇭🇷',
    serbia: '🇷🇸',
    'czech republic': '🇨🇿',
    czechia: '🇨🇿',
    romania: '🇷🇴',
    bulgaria: '🇧🇬',
    hungary: '🇭🇺',
    ukraine: '🇺🇦',
    russia: '🇷🇺',
    greece: '🇬🇷',
    ireland: '🇮🇪',
    'northern ireland': '🇬🇧',
    china: '🇨🇳',
    india: '🇮🇳',
    thailand: '🇹🇭',
    vietnam: '🇻🇳',
    indonesia: '🇮🇩',
    malaysia: '🇲🇾',
    qatar: '🇶🇦',
    uae: '🇦🇪',
    'united arab emirates': '🇦🇪',
    iran: '🇮🇷',
    iraq: '🇮🇶',
    algeria: '🇩🇿',
    tunisia: '🇹🇳',
    senegal: '🇸🇳',
    ghana: '🇬🇭',
    cameroon: '🇨🇲',
    'ivory coast': '🇨🇮',
    "cote d'ivoire": '🇨🇮',
    kenya: '🇰🇪',
    uganda: '🇺🇬',
    tanzania: '🇹🇿',
    zambia: '🇿🇲',
    zimbabwe: '🇿🇼',
    angola: '🇦🇴',
    congo: '🇨🇩',
    'dr congo': '🇨🇩',
    mali: '🇲🇱',
    israel: '🇮🇱',
    canada: '🇨🇦',
    georgia: '🇬🇪',
    armenia: '🇦🇲',
    azerbaijan: '🇦🇿',
    kazakhstan: '🇰🇿',
    bolivia: '🇧🇴',
    venezuela: '🇻🇪',
    guatemala: '🇬🇹',
    honduras: '🇭🇳',
    panama: '🇵🇦',
    'costa rica': '🇨🇷',
    jamaica: '🇯🇲',
  };

  for (const [key, flag] of Object.entries(flags)) {
    if (cLower.includes(key)) return flag;
  }

  return '🌍';
}

/**
 * Format league header according to requested style:
 * 🌍 Cosafa U20 Cup
 * 🇺🇿 Uzbekistan ❥ 1st Division
 * 🇵🇾 Paraguay ❥ Reserve League
 */
export function formatLeagueHeader(league: League): string {
  const cName = (league.country || '').trim();
  const lName = (league.name || '').trim();
  const cLower = cName.toLowerCase();

  const isInternational =
    !cName ||
    cLower === 'world' ||
    cLower === 'international' ||
    cLower === 'europe' ||
    cLower === 'africa' ||
    cLower === 'asia' ||
    cLower === 'south america' ||
    cLower === 'north & central america' ||
    cLower === 'oceania' ||
    lName.toLowerCase().includes('cosafa') ||
    lName.toLowerCase().includes('champions league') ||
    lName.toLowerCase().includes('europa') ||
    lName.toLowerCase().includes('conference') ||
    lName.toLowerCase().includes('copa libertadores') ||
    lName.toLowerCase().includes('world cup') ||
    lName.toLowerCase().includes('afcon');

  if (isInternational) {
    return `🌍 ${lName || cName}`;
  }

  const flag = getCountryFlag(cName, league.countryCode);
  if (flag === '🌍') {
    return `🌍 ${lName || cName}`;
  }

  return `${flag} ${cName} ❥ ${lName}`;
}

/**
 * Formats an individual match according to the user requested layout:
 * ◉ 𝟒𝟓+𝟒' | Botswana U20 𝟎-𝟐 Malawi U20
 * 🕒+3 ⛳1-4 🟨1-0 🟥1-0 🔁1-0
 * 🏹2-12 🎯0-7 🅿️39%-61%
 *
 * or with halves:
 * ◉ 𝟗𝟎' | FC Lochin 𝟎-𝟑 Respublika FA
 * ➨ 1st Half : 0-2 | 2nd Half : 0-1
 * ⛳6-1 🟨2-1 🔁5-4 🏹13-12 🎯7-4
 * 🅿️60%-40%
 */
export function formatScoreboardMatchItem(match: Match): string {
  // 1. Minute formatting with bold Unicode digits
  let minPart = '';
  const extraMatch = (match.statusText || '').match(/(\d+)\+(\d+)/);
  if (match.minute && match.extraMinute) {
    minPart = `${toBoldUnicodeDigits(match.minute)}+${toBoldUnicodeDigits(match.extraMinute)}'`;
  } else if (extraMatch) {
    minPart = `${toBoldUnicodeDigits(extraMatch[1])}+${toBoldUnicodeDigits(extraMatch[2])}'`;
  } else if (match.minute) {
    minPart = `${toBoldUnicodeDigits(match.minute)}'`;
  } else if (match.status === 'FINISHED') {
    minPart = `${toBoldUnicodeDigits(90)}'`;
  } else if (match.status === 'PAUSED') {
    minPart = `${toBoldUnicodeDigits(45)}'`;
  } else {
    minPart = `${toBoldUnicodeDigits(1)}'`;
  }

  // Bold scores
  const homeScoreBold = toBoldUnicodeDigits(match.homeScore);
  const awayScoreBold = toBoldUnicodeDigits(match.awayScore);

  const lines: string[] = [];

  // Match line: ◉ 𝟒𝟓+𝟒' | Botswana U20 𝟎-𝟐 Malawi U20
  lines.push(`◉ ${minPart} | ${match.homeTeam.name} ${homeScoreBold}-${awayScoreBold} ${match.awayTeam.name}`);

  // 2. Halves breakdown line (if available)
  // ➨ 1st Half : 0-2 | 2nd Half : 0-1
  let h1: number | undefined = match.halfScores?.home1;
  let a1: number | undefined = match.halfScores?.away1;
  let h2: number | undefined = match.halfScores?.home2;
  let a2: number | undefined = match.halfScores?.away2;

  // Derive halves from events if not explicitly set
  if (h1 === undefined && match.events && match.events.length > 0) {
    const goals1 = match.events.filter(e => e.type === 'GOAL' && e.minute <= 45);
    const goals2 = match.events.filter(e => e.type === 'GOAL' && e.minute > 45);
    if (goals1.length > 0 || goals2.length > 0) {
      h1 = goals1.filter(e => e.teamSide === 'home').length;
      a1 = goals1.filter(e => e.teamSide === 'away').length;
      h2 = goals2.filter(e => e.teamSide === 'home').length;
      a2 = goals2.filter(e => e.teamSide === 'away').length;
    }
  }

  // In finished matches or 2nd half, if h1 is known, derive h2
  if (h1 !== undefined && a1 !== undefined) {
    const isSecondHalfOrFinished =
      match.status === 'FINISHED' ||
      (match.minute && match.minute > 45) ||
      (match.statusText || '').toLowerCase().includes('2nd');

    if (isSecondHalfOrFinished) {
      if (h2 === undefined) h2 = Math.max(0, match.homeScore - h1);
      if (a2 === undefined) a2 = Math.max(0, match.awayScore - a1);
      lines.push(`➨ 1st Half : ${h1}-${a1} | 2nd Half : ${h2}-${a2}`);
    } else {
      lines.push(`➨ 1st Half : ${h1}-${a1}`);
    }
  }

  // 3. Stats lines
  const stats = match.stats || {};
  const events = match.events || [];

  const badges: string[] = [];

  // Added time (🕒+3, 🕒+4)
  const added = match.addedTime || match.extraMinute;
  if (added && added > 0) {
    badges.push(`🕒+${added}`);
  }

  // Corner kicks (⛳1-4)
  const cHome = stats.cornersHome ?? events.filter(e => e.type === 'CORNER' && e.teamSide === 'home').length;
  const cAway = stats.cornersAway ?? events.filter(e => e.type === 'CORNER' && e.teamSide === 'away').length;
  badges.push(`⛳${cHome}-${cAway}`);

  // Yellow cards (🟨1-0)
  const evYellowHome = events.filter(e => e.type === 'YELLOW_CARD' && e.teamSide === 'home').length;
  const evYellowAway = events.filter(e => e.type === 'YELLOW_CARD' && e.teamSide === 'away').length;
  const yHome = stats.yellowCardsHome ?? evYellowHome;
  const yAway = stats.yellowCardsAway ?? evYellowAway;
  badges.push(`🟨${yHome}-${yAway}`);

  // Red cards (🟥1-0) - shown only if red cards occurred
  const evRedHome = events.filter(e => (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD') && e.teamSide === 'home').length;
  const evRedAway = events.filter(e => (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD') && e.teamSide === 'away').length;
  const rHome = stats.redCardsHome ?? evRedHome;
  const rAway = stats.redCardsAway ?? evRedAway;
  if (rHome > 0 || rAway > 0) {
    badges.push(`🟥${rHome}-${rAway}`);
  }

  // Substitutions (🔁5-4)
  const evSubHome = events.filter(e => e.type === 'SUBSTITUTION' && e.teamSide === 'home').length;
  const evSubAway = events.filter(e => e.type === 'SUBSTITUTION' && e.teamSide === 'away').length;
  const subHome = stats.substitutionsHome ?? evSubHome;
  const subAway = stats.substitutionsAway ?? evSubAway;
  badges.push(`🔁${subHome}-${subAway}`);

  // Total shots (🏹2-12)
  if (stats.shotsHome !== undefined && stats.shotsAway !== undefined) {
    badges.push(`🏹${stats.shotsHome}-${stats.shotsAway}`);
  }

  // Shots on target (🎯0-7)
  if (stats.shotsOnTargetHome !== undefined && stats.shotsOnTargetAway !== undefined) {
    badges.push(`🎯${stats.shotsOnTargetHome}-${stats.shotsOnTargetAway}`);
  }

  // Penalties (⚖️0-1) - shown only if penalty occurred
  const evPenHome = events.filter(e => e.detail?.toLowerCase().includes('penalty') && e.teamSide === 'home').length;
  const evPenAway = events.filter(e => e.detail?.toLowerCase().includes('penalty') && e.teamSide === 'away').length;
  const penHome = stats.penaltiesHome ?? evPenHome;
  const penAway = stats.penaltiesAway ?? evPenAway;
  if (penHome > 0 || penAway > 0) {
    badges.push(`⚖️${penHome}-${penAway}`);
  }

  // Possession (🅿️39%-61%)
  if (stats.possessionHome !== undefined && stats.possessionAway !== undefined) {
    badges.push(`🅿️${stats.possessionHome}%-${stats.possessionAway}%`);
  }

  // Chunk badges into up to 5 per line to maintain the exact format layout
  if (badges.length > 0) {
    if (badges.length <= 5) {
      lines.push(badges.join(' '));
    } else {
      lines.push(badges.slice(0, 5).join(' '));
      lines.push(badges.slice(5).join(' '));
    }
  }

  return lines.join('\n');
}

/**
 * Builds the complete multi-match scoreboard document grouped by league
 */
export function formatScoreboardDocument(matches: Match[]): string {
  if (!matches || matches.length === 0) return '';

  // Group matches by league
  const leagueGroups = new Map<string, { header: string; matches: Match[] }>();
  for (const m of matches) {
    const lId = m.league?.id || m.league?.name || 'unknown';
    if (!leagueGroups.has(lId)) {
      leagueGroups.set(lId, {
        header: formatLeagueHeader(m.league),
        matches: [],
      });
    }
    leagueGroups.get(lId)!.matches.push(m);
  }

  const sections: string[] = [];
  for (const group of leagueGroups.values()) {
    const groupLines: string[] = [group.header];
    for (const m of group.matches) {
      groupLines.push(formatScoreboardMatchItem(m));
    }
    sections.push(groupLines.join('\n'));
  }

  return `${sections.join('\n')}\n${SCOREBOARD_LEGEND}`;
}

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
    return '🌍 LIVE SCORES UPDATE\nNo active live matches currently in progress.\n\n' + SCOREBOARD_LEGEND;
  }

  // Filter strictly by target leagues if configured
  let filteredMatches = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filteredMatches = matches.filter(m => config.targetLeagueIds.includes(m.league.id));
  } else {
    filteredMatches = []; // If no leagues are selected for today, do not include unselected leagues
  }

  if (filteredMatches.length === 0) {
    return '🌍 LIVE SCORES UPDATE\nNo active live matches in selected leagues.\n\n' + SCOREBOARD_LEGEND;
  }

  const scoreboardContent = formatScoreboardDocument(filteredMatches);

  // If user configured a custom template with {matches_list}, substitute into it
  const isCustomTemplate =
    config.postTemplateRoundup &&
    config.postTemplateRoundup.trim().length > 0 &&
    config.postTemplateRoundup.includes('{matches_list}') &&
    !config.postTemplateRoundup.includes('⚽ LIVE MATCHES SCOREBOARD ⏱️');

  if (isCustomTemplate) {
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

    return config.postTemplateRoundup
      .replace(/{count}/g, String(filteredMatches.length))
      .replace(/{time}/g, timeStr)
      .replace(/{matches_list}/g, scoreboardContent);
  }

  // Pure requested scoreboard format
  return scoreboardContent;
}

export function formatResultsRoundupPost(matches: Match[], config: FacebookPageConfig): string {
  if (!matches || matches.length === 0) {
    return '🌍 FULL-TIME RESULTS\nNo new completed matches to report.\n\n' + SCOREBOARD_LEGEND;
  }

  // Filter strictly by target leagues if configured
  let filtered = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filtered = matches.filter(m => config.targetLeagueIds.includes(m.league.id));
  } else {
    filtered = []; // If no leagues are selected for today, do not include unselected leagues
  }

  if (filtered.length === 0) {
    return '🌍 FULL-TIME RESULTS\nNo completed matches in selected leagues.\n\n' + SCOREBOARD_LEGEND;
  }

  const scoreboardContent = formatScoreboardDocument(filtered);

  const isCustomTemplate =
    config.postTemplateFullTimeRoundup &&
    config.postTemplateFullTimeRoundup.trim().length > 0 &&
    config.postTemplateFullTimeRoundup.includes('{matches_list}') &&
    !config.postTemplateFullTimeRoundup.includes('🏁 FULL-TIME RESULTS ⚽');

  if (isCustomTemplate) {
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

    return config.postTemplateFullTimeRoundup
      .replace(/{count}/g, String(filtered.length))
      .replace(/{time}/g, timeStr)
      .replace(/{matches_list}/g, scoreboardContent);
  }

  // Pure requested scoreboard format
  return scoreboardContent;
}

