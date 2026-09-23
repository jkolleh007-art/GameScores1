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
    .replace(/{league_tag}/g, leagueTag)
    .replace(/#GameScores/g, '#Football');
}

export function formatYellowCardPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateYellowCard || "🟨 YELLOW CARD! {player} ({team}) booked in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #YellowCard #Football";

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
    .replace(/{league_tag}/g, leagueTag)
    .replace(/#GameScores/g, '#Football');
}

export function formatRedCardPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateRedCard || "🟥 RED CARD! {team} player {player} sent off in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #RedCard #Football";

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
    .replace(/{league_tag}/g, leagueTag)
    .replace(/#GameScores/g, '#Football');
}

export function formatCornerPost(match: Match, event: MatchEvent, config: FacebookPageConfig): string {
  const minVal = getMinuteValue(event.minute, match.minute, match.statusText);
  const minStr = String(minVal);
  const period = minVal <= 45 ? '1st Half' : minVal <= 90 ? '2nd Half' : 'Extra Time';

  let template = config.postTemplateCorner || "🚩 CORNER KICK! Corner awarded to {team} in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #CornerKick #Football";

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
    .replace(/{league_tag}/g, leagueTag)
    .replace(/#GameScores/g, '#Football');
}

export function formatKickoffPost(match: Match, config: FacebookPageConfig): string {
  const template = config.postTemplateKickoff || "⚡ MATCH KICK-OFF! (1st Half)\n{home_team} vs {away_team}\n⏱️ Match Time: Kick-Off (1')\n🏆 {league_name}\n\nStay tuned for live score updates!\n#{league_tag} #Matchday";
  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag)
    .replace(/#GameScores/g, '#Matchday');
}

export function formatHalfTimePost(match: Match, config: FacebookPageConfig): string {
  const template = config.postTemplateHalfTime || "⏸️ HALF-TIME: {home_team} {home_score} - {away_score} {away_team}\n⏱️ Match Time: Half-Time (45')\n🏆 {league_name}\n\n#{league_tag} #HalfTime";
  const leagueTag = match.league.name.replace(/[^a-zA-Z0-9]/g, '');

  return template
    .replace(/{home_team}/g, match.homeTeam.name)
    .replace(/{away_team}/g, match.awayTeam.name)
    .replace(/{home_score}/g, String(match.homeScore))
    .replace(/{away_score}/g, String(match.awayScore))
    .replace(/{league_name}/g, match.league.name)
    .replace(/{league_tag}/g, leagueTag)
    .replace(/#GameScores/g, '#HalfTime');
}

export function formatFullTimePost(match: Match, config: FacebookPageConfig): string {
  const template = config.postTemplateFullTime || "🏁 FULL-TIME: {home_team} {home_score} - {away_score} {away_team}\n⏱️ Match Time: Full-Time (90')\n🏆 {league_name}\n{stats_summary}\n\nThanks for following!\n#{league_tag} #FullTime";
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
    .replace(/{stats_summary}/g, statsSummary)
    .replace(/#GameScores/g, '#Football');
}

/**
 * =========================================================================
 * Anti-Spam Variation & Smart Hashtags Engine
 *
 * Meta Graph API algorithms flag Facebook Pages when consecutive posts share:
 * 1. Identical headlines/headers (e.g., "LIVE MATCHES SCOREBOARD" every 5m)
 * 2. Identical structural boilerplate sentences
 * 3. Identical clusters of generic hashtags (e.g., "#GameScores #LiveScores")
 *
 * This engine generates natural human variation across headlines, subheads,
 * context closings, and rotates smart 1-3 targeted hashtags derived from active leagues.
 * =========================================================================
 */

export const LEAGUE_HASHTAG_MAP: Record<string, string> = {
  'premier league': '#PremierLeague',
  'champions league': '#UCL',
  'uefa champions league': '#UCL',
  'europa league': '#UEL',
  'uefa europa league': '#UEL',
  'conference league': '#UECL',
  'laliga': '#LaLiga',
  'la liga': '#LaLiga',
  'serie a': '#SerieA',
  'bundesliga': '#Bundesliga',
  'ligue 1': '#Ligue1',
  'eredivisie': '#Eredivisie',
  'mls': '#MLS',
  'major league soccer': '#MLS',
  'championship': '#EFLChampionship',
  'efl': '#EFL',
  'fa cup': '#FACup',
  'copa del rey': '#CopaDelRey',
  'caf champions league': '#TotalEnergiesCAFCL',
  'afcon': '#AFCON',
  'saudi pro league': '#RoshnSaudiLeague',
  'brasileirao': '#Brasileirao',
  'liga mx': '#LigaMX',
};

const ROTATING_FOOTBALL_TOPIC_TAGS = [
  '#Football',
  '#Matchday',
  '#Soccer',
  '#FootballScores',
  '#PitchAction',
  '#SoccerLife',
  '#WeekendFootball',
];

export const LIVE_HEADLINES = [
  '⚽ LIVE MATCHDAY TRACKER ⏱️',
  '⚡ IN-PLAY FOOTBALL SCOREBOARD',
  '🔥 ONGOING ACTION AROUND THE GROUNDS',
  '🎯 LIVE SCORE UPDATE & HIGHLIGHTS',
  '⏱️ IN-PLAY MATCH SUMMARY',
  '⚽ LIVE SCORES IN PROGRESS',
  '🌟 LIVE PITCH ACTION & SCORES',
  '🏆 CURRENT SCOREBOARD UPDATE',
  '⚽ LIVE SCORES AROUND THE PITCHES',
  '⚡ ONGOING MATCH SCORES',
];

export const LIVE_SUBHEADS: Array<(count: number, time: string) => string> = [
  (count, time) => `📊 ${count} active match${count === 1 ? '' : 'es'} in progress (${time})`,
  (count, time) => `⏱️ Match clock check across ${count} ongoing fixture${count === 1 ? '' : 's'} (${time})`,
  (count, time) => `⚡ ${count} encounter${count === 1 ? '' : 's'} underway right now (${time})`,
  (count, time) => `🔥 Live scorelines from ${count} contest${count === 1 ? '' : 's'} in action (${time})`,
  (count, time) => `🎯 ${count} match${count === 1 ? '' : 'es'} currently in play as of ${time}`,
  (count, time) => `🏆 Ongoing matchday action (${count} game${count === 1 ? '' : 's'} • ${time})`,
];

export const LIVE_CLOSINGS = [
  '⚡ Decisive moments and second-half drama coming right up!',
  'Which squad are you backing to grab the victory today?',
  'Plenty of time remaining for twists and turns on the pitch!',
  'What has been the standout performance for you so far?',
  'Stay locked in as we keep tracking all today’s matches.',
  'Drop your live score predictions in the comments below!',
  'Every minute counts—more goals and highlights around the corner.',
  'Exciting scorelines developing across the grounds!',
  'Who needs an equalizer in the second half? Have your say!',
  'Football at its finest—stay tuned for the next whistle!',
];

export const HT_HEADLINES = [
  '⏸️ HALF-TIME SCOREBOARD ⏱️',
  '⏱️ FIRST-HALF ROUNDUP: SCORES AT THE BREAK',
  '⚽ HALF-TIME WHISTLES ACROSS TODAY’S CARD',
  '⚡ INTERVAL SCORE CHECK-IN',
  '⏸️ SCORES AT THE BREAK',
  '🎯 MIDPOINT MATCH SCORES',
  '🏆 HALF-TIME SCORE DIGEST',
  '⏸️ FIRST 45 MINUTES IN THE BOOKS',
];

export const HT_SUBHEADS: Array<(count: number, time: string) => string> = [
  (count, time) => `📊 ${count} match${count === 1 ? '' : 'es'} at the interval (${time})`,
  (count, time) => `⏱️ Half-time standings across ${count} pitch${count === 1 ? '' : 'es'} (${time})`,
  (count, time) => `⚡ Teams head to the dressing rooms (${count} game${count === 1 ? '' : 's'} • ${time})`,
  (count, time) => `🎯 First 45 minutes wrapped across ${count} contest${count === 1 ? '' : 's'} (${time})`,
  (count, time) => `⏸️ Scores after the opening 45' (${count} fixture${count === 1 ? '' : 's'} • ${time})`,
];

export const HT_CLOSINGS = [
  '⚡ Second half action resumes shortly—who will break through?',
  'Managers making key tactical adjustments in the locker rooms right now.',
  'Big second-half decisions ahead—who takes all three points?',
  'All square or tight margins—who will capitalize after the restart?',
  'Share your halftime thoughts and score predictions below!',
  'Second-half kickoff right around the corner—stay tuned!',
];

export const FT_HEADLINES = [
  '🏁 FULL-TIME WHISTLES & FINAL SCORES ⚽',
  '⚽ MATCHDAY FINAL RESULTS DIGEST',
  '🎯 TODAY’S CONCLUDED MATCHES & SCORES',
  '🏆 FULL-TIME RESULTS ROUNDUP',
  '🏁 FINAL SCORES CONFIRMED',
  '⚡ CONCLUDED GAMES DIGEST',
  '⚽ FINAL WHISTLE ROUNDUP',
  '🏁 COMPLETED MATCHES & FINAL STANDINGS',
];

export const FT_SUBHEADS: Array<(count: number, time: string) => string> = [
  (count, time) => `📊 ${count} match${count === 1 ? '' : 'es'} officially concluded (${time})`,
  (count, time) => `🏁 Final whistles blown on ${count} fixture${count === 1 ? '' : 's'} (${time})`,
  (count, time) => `🎯 Confirmed full-time scorelines across ${count} game${count === 1 ? '' : 's'} (${time})`,
  (count, time) => `🏆 Official final results (${count} match${count === 1 ? '' : 'es'} • ${time})`,
  (count, time) => `⚽ Complete scores for ${count} match${count === 1 ? '' : 'es'} (${time})`,
];

export const FT_CLOSINGS = [
  'Which result was the match of the day for you?',
  'Share your thoughts on today’s final scorelines in the comments!',
  'A thrilling set of fixtures wrapped up. Thanks for following with us!',
  'What was the most surprising outcome on the card today?',
  'Great football on display—congratulations to today’s winners!',
  'That wraps up this round of fixtures—see you for the next kickoff!',
];

/**
 * Generate 2 to 3 smart, dynamic, non-repetitive hashtags
 * derived from active leagues and a cycling football topic tag.
 * NEVER outputs repeated static boilerplate like #GameScores.
 */
export function generateSmartDynamicHashtags(matches: Match[], type: 'LIVE' | 'HT' | 'FT'): string {
  const tags: string[] = [];
  const nowMin = Math.floor(Date.now() / (1000 * 60));

  // 1. Extract up to 2 specific league hashtags from actual matches
  const seenLeagues = new Set<string>();
  for (const m of matches) {
    if (!m.league?.name) continue;
    const lNameLower = m.league.name.toLowerCase().trim();
    if (seenLeagues.has(lNameLower)) continue;
    seenLeagues.add(lNameLower);

    let matchedTag: string | undefined;
    for (const [key, tag] of Object.entries(LEAGUE_HASHTAG_MAP)) {
      if (lNameLower.includes(key)) {
        matchedTag = tag;
        break;
      }
    }

    if (!matchedTag) {
      const clean = m.league.name.replace(/[^a-zA-Z0-9]/g, '');
      if (clean && clean.length >= 3 && clean.length <= 20) {
        matchedTag = `#${clean}`;
      }
    }

    if (matchedTag && !tags.includes(matchedTag)) {
      tags.push(matchedTag);
      if (tags.length >= 2) break;
    }
  }

  // 2. Add 1 context tag based on post type (cycling to prevent repeated strings)
  if (type === 'LIVE') {
    const liveTagPool = ['#LiveScores', '#InPlay', '#LiveFootball'];
    tags.push(liveTagPool[nowMin % liveTagPool.length]);
  } else if (type === 'HT') {
    const htTagPool = ['#HalfTime', '#HTScores', '#AtTheBreak'];
    tags.push(htTagPool[nowMin % htTagPool.length]);
  } else if (type === 'FT') {
    const ftTagPool = ['#FullTime', '#Results', '#FinalScore'];
    tags.push(ftTagPool[nowMin % ftTagPool.length]);
  }

  // 3. If under 3 tags total, add a rotating general football tag
  if (tags.length < 3) {
    const topicTag = ROTATING_FOOTBALL_TOPIC_TAGS[nowMin % ROTATING_FOOTBALL_TOPIC_TAGS.length];
    if (!tags.includes(topicTag)) {
      tags.push(topicTag);
    }
  }

  // Strict maximum 3 tags to adhere to Meta best practices
  return tags.slice(0, 3).join(' ');
}

export function formatStandardLiveRoundupMatches(matches: Match[], config: FacebookPageConfig): { matchesList: string; hashtags: string } {
  const leagueGroups = new Map<string, Match[]>();
  for (const m of matches) {
    const lName = m.league?.name || 'International / Other';
    if (!leagueGroups.has(lName)) {
      leagueGroups.set(lName, []);
    }
    leagueGroups.get(lName)!.push(m);
  }

  const leagueSections: string[] = [];

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
        timeBadge = "⏸️ HT (45')";
      } else if (m.minute) {
        const extra = m.extraMinute ? `+${m.extraMinute}` : '';
        const periodStr = m.statusText?.includes('2nd') ? ' • 2nd Half' : m.statusText?.includes('1st') ? ' • 1st Half' : '';
        timeBadge = `⏱️ ${m.minute}${extra}'${periodStr}`;
      } else {
        timeBadge = `⏱️ ${m.statusText || 'LIVE'}`;
      }

      // 2. Stats (Cards, Corners, Shots)
      const stats = m.stats || {};
      const events = m.events || [];

      // Corners
      const cHome = stats.cornersHome ?? events.filter(e => e.teamSide === 'home' && e.type === 'CORNER').length;
      const cAway = stats.cornersAway ?? events.filter(e => e.teamSide === 'away' && e.type === 'CORNER').length;

      // Yellow cards
      const evYellowHome = events.filter(e => e.teamSide === 'home' && e.type === 'YELLOW_CARD').length;
      const evYellowAway = events.filter(e => e.teamSide === 'away' && e.type === 'YELLOW_CARD').length;
      const yHome = stats.yellowCardsHome ?? evYellowHome;
      const yAway = stats.yellowCardsAway ?? evYellowAway;

      // Red cards
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

      if (stats.shotsOnTargetHome !== undefined && stats.shotsOnTargetAway !== undefined) {
        statBadges.push(`🎯 Shots on Target: ${stats.shotsOnTargetHome}-${stats.shotsOnTargetAway}`);
      }

      return `• ${m.homeTeam.name} ${m.homeScore} - ${m.awayScore} ${m.awayTeam.name} (${timeBadge})\n  ↳ ${statBadges.join(' | ')}`;
    });

    leagueSections.push(`🏆 ${leagueName}\n${matchLines.join('\n')}`);
  }

  const smartHashtags = generateSmartDynamicHashtags(matches, 'LIVE');

  return {
    matchesList: leagueSections.join('\n\n'),
    hashtags: smartHashtags,
  };
}

export function formatStandardResultsRoundupMatches(matches: Match[], config: FacebookPageConfig): { matchesList: string; hashtags: string } {
  const leagueGroups = new Map<string, Match[]>();
  for (const m of matches) {
    const lName = m.league?.name || 'International / Other';
    if (!leagueGroups.has(lName)) {
      leagueGroups.set(lName, []);
    }
    leagueGroups.get(lName)!.push(m);
  }

  const leagueSections: string[] = [];

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

    leagueSections.push(`🏆 ${leagueName}\n${matchLines.join('\n')}`);
  }

  const smartHashtags = generateSmartDynamicHashtags(matches, 'FT');

  return {
    matchesList: leagueSections.join('\n\n'),
    hashtags: smartHashtags,
  };
}

export function formatLiveRoundupPost(
  matches: Match[],
  config: FacebookPageConfig,
  aiCopy?: Partial<{ headline: string; subhead: string; closing: string; hashtags: string }>
): string {
  if (!matches || matches.length === 0) {
    return '⚽ LIVE SCORES UPDATE\nNo active live matches currently in progress.\n#Football #LiveScores';
  }

  // Filter strictly by target leagues if configured
  let filteredMatches = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filteredMatches = matches.filter(m => config.targetLeagueIds.includes(m.league.id));
  } else {
    filteredMatches = []; // If no leagues are selected for today, do not include unselected leagues
  }

  if (filteredMatches.length === 0) {
    return '⚽ LIVE SCORES UPDATE\nNo active live matches in selected leagues.\n#Football #Matchday';
  }

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

  // If user selected compact_emoji style:
  if (config.roundupFormat === 'compact_emoji') {
    const scoreboardContent = formatScoreboardDocument(filteredMatches);
    if (config.postTemplateRoundup && config.postTemplateRoundup.includes('{matches_list}')) {
      return config.postTemplateRoundup
        .replace(/{count}/g, String(filteredMatches.length))
        .replace(/{time}/g, timeStr)
        .replace(/{matches_list}/g, scoreboardContent)
        .replace(/#GameScores/g, '#Football');
    }
    return scoreboardContent;
  }

  // Standard Clean Format with Dynamic Anti-Spam Variations or DeepSeek AI Copy
  const { matchesList, hashtags: defaultHashtags } = formatStandardLiveRoundupMatches(filteredMatches, config);

  // Pseudo-random deterministic rotation seed based on current 5-min epoch + count + match seed
  const epoch5m = Math.floor(Date.now() / (5 * 60 * 1000));
  const seed = Math.abs(epoch5m + filteredMatches.length + (filteredMatches[0]?.id ? filteredMatches[0].id.charCodeAt(0) : 0));

  const headline = aiCopy?.headline?.trim() || LIVE_HEADLINES[seed % LIVE_HEADLINES.length];
  const subheadGen = LIVE_SUBHEADS[seed % LIVE_SUBHEADS.length];
  const subhead = aiCopy?.subhead?.trim() || subheadGen(filteredMatches.length, timeStr);
  const closing = aiCopy?.closing?.trim() || LIVE_CLOSINGS[seed % LIVE_CLOSINGS.length];
  const finalHashtags = aiCopy?.hashtags?.trim() || defaultHashtags;

  const customTemplate = config.postTemplateRoundup?.trim();
  const isDefaultOrEmpty =
    !customTemplate ||
    customTemplate.includes('⚽ LIVE MATCHES SCOREBOARD') ||
    customTemplate.includes('#GameScores');

  if (isDefaultOrEmpty) {
    // Generate dynamic anti-spam post with varied structure and fresh hashtags
    return `${headline}\n${subhead}\n\n${matchesList}\n\n${closing}\n${finalHashtags}`;
  }

  // User wrote their own custom template: support all tokens and eliminate repeated static tags
  return customTemplate
    .replace(/{headline}/g, headline)
    .replace(/{subhead}/g, subhead)
    .replace(/{closing}/g, closing)
    .replace(/{count}/g, String(filteredMatches.length))
    .replace(/{time}/g, timeStr)
    .replace(/{matches_list}/g, matchesList)
    .replace(/{hashtags}/g, finalHashtags)
    .replace(/#GameScores/g, '');
}

export function formatResultsRoundupPost(
  matches: Match[],
  config: FacebookPageConfig,
  aiCopy?: Partial<{ headline: string; subhead: string; closing: string; hashtags: string }>
): string {
  if (!matches || matches.length === 0) {
    return '🏁 FULL-TIME RESULTS ⚽\nNo new completed matches to report.\n#FullTime #Football';
  }

  // Filter strictly by target leagues if configured
  let filtered = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filtered = matches.filter(m => config.targetLeagueIds.includes(m.league.id));
  } else {
    filtered = []; // If no leagues are selected for today, do not include unselected leagues
  }

  if (filtered.length === 0) {
    return '🏁 FULL-TIME RESULTS ⚽\nNo completed matches in selected leagues.\n#FullTime #Football';
  }

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

  // If user selected compact_emoji style:
  if (config.roundupFormat === 'compact_emoji') {
    const scoreboardContent = formatScoreboardDocument(filtered);
    if (config.postTemplateFullTimeRoundup && config.postTemplateFullTimeRoundup.includes('{matches_list}')) {
      return config.postTemplateFullTimeRoundup
        .replace(/{count}/g, String(filtered.length))
        .replace(/{time}/g, timeStr)
        .replace(/{matches_list}/g, scoreboardContent)
        .replace(/#GameScores/g, '#Football');
    }
    return scoreboardContent;
  }

  // Standard Clean Results Format with Dynamic Anti-Spam Variations or DeepSeek AI Copy
  const { matchesList, hashtags: defaultHashtags } = formatStandardResultsRoundupMatches(filtered, config);

  const epoch5m = Math.floor(Date.now() / (5 * 60 * 1000));
  const seed = Math.abs(epoch5m + filtered.length + (filtered[0]?.id ? filtered[0].id.charCodeAt(0) : 0));

  const headline = aiCopy?.headline?.trim() || FT_HEADLINES[seed % FT_HEADLINES.length];
  const subheadGen = FT_SUBHEADS[seed % FT_SUBHEADS.length];
  const subhead = aiCopy?.subhead?.trim() || subheadGen(filtered.length, timeStr);
  const closing = aiCopy?.closing?.trim() || FT_CLOSINGS[seed % FT_CLOSINGS.length];
  const finalHashtags = aiCopy?.hashtags?.trim() || defaultHashtags;

  const customTemplate = config.postTemplateFullTimeRoundup?.trim();
  const isDefaultOrEmpty =
    !customTemplate ||
    customTemplate.includes('🏁 FULL-TIME RESULTS') ||
    customTemplate.includes('#GameScores');

  if (isDefaultOrEmpty) {
    return `${headline}\n${subhead}\n\n${matchesList}\n\n${closing}\n${finalHashtags}`;
  }

  return customTemplate
    .replace(/{headline}/g, headline)
    .replace(/{subhead}/g, subhead)
    .replace(/{closing}/g, closing)
    .replace(/{count}/g, String(filtered.length))
    .replace(/{time}/g, timeStr)
    .replace(/{matches_list}/g, matchesList)
    .replace(/{hashtags}/g, finalHashtags)
    .replace(/#GameScores/g, '');
}

export function isMatchAtHalfTime(m: Match): boolean {
  if (m.status === 'PAUSED') return true;
  const stLower = (m.statusText || '').toLowerCase().trim();
  return (
    stLower === 'ht' ||
    stLower === 'half time' ||
    stLower === 'halftime' ||
    stLower === 'half-time' ||
    stLower.startsWith('ht ') ||
    stLower.endsWith(' ht') ||
    stLower.includes('half-time') ||
    stLower.includes('halftime')
  );
}

export function formatStandardHalfTimeRoundupMatches(matches: Match[], config: FacebookPageConfig): { matchesList: string; hashtags: string } {
  const leagueGroups = new Map<string, Match[]>();
  for (const m of matches) {
    const lName = m.league?.name || 'International / Other';
    if (!leagueGroups.has(lName)) {
      leagueGroups.set(lName, []);
    }
    leagueGroups.get(lName)!.push(m);
  }

  const leagueSections: string[] = [];

  for (const [leagueName, lMatches] of leagueGroups.entries()) {
    const matchLines = lMatches.map(m => {
      const stats = m.stats || {};
      const events = m.events || [];

      // Corners
      const cHome = stats.cornersHome ?? events.filter(e => e.teamSide === 'home' && e.type === 'CORNER').length;
      const cAway = stats.cornersAway ?? events.filter(e => e.teamSide === 'away' && e.type === 'CORNER').length;

      // Yellow cards
      const evYellowHome = events.filter(e => e.teamSide === 'home' && e.type === 'YELLOW_CARD').length;
      const evYellowAway = events.filter(e => e.teamSide === 'away' && e.type === 'YELLOW_CARD').length;
      const yHome = stats.yellowCardsHome ?? evYellowHome;
      const yAway = stats.yellowCardsAway ?? evYellowAway;

      // Red cards
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

      if (stats.shotsOnTargetHome !== undefined && stats.shotsOnTargetAway !== undefined) {
        statBadges.push(`🎯 Shots on Target: ${stats.shotsOnTargetHome}-${stats.shotsOnTargetAway}`);
      }

      return `• ${m.homeTeam.name} ${m.homeScore} - ${m.awayScore} ${m.awayTeam.name} (⏸️ HT)\n  ↳ ${statBadges.join(' | ')}`;
    });

    leagueSections.push(`🏆 ${leagueName}\n${matchLines.join('\n')}`);
  }

  const smartHashtags = generateSmartDynamicHashtags(matches, 'HT');

  return {
    matchesList: leagueSections.join('\n\n'),
    hashtags: smartHashtags,
  };
}

export function formatHalfTimeRoundupPost(
  matches: Match[],
  config: FacebookPageConfig,
  aiCopy?: Partial<{ headline: string; subhead: string; closing: string; hashtags: string }>
): string {
  if (!matches || matches.length === 0) {
    return '⏸️ HALF-TIME SCORES ⚽\nNo active matches at half-time currently.\n#HalfTime #Football';
  }

  // Filter strictly by target leagues if configured
  let filtered = matches;
  if (config.targetLeagueIds && config.targetLeagueIds.length > 0) {
    filtered = matches.filter(m => config.targetLeagueIds.includes(m.league?.id));
  } else {
    filtered = [];
  }

  if (filtered.length === 0) {
    return '⏸️ HALF-TIME SCORES ⚽\nNo matches at half-time in selected leagues.\n#HalfTime #Football';
  }

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

  // If user selected compact_emoji style:
  if (config.roundupFormat === 'compact_emoji') {
    const scoreboardContent = formatScoreboardDocument(filtered);
    if (config.postTemplateHalfTimeRoundup && config.postTemplateHalfTimeRoundup.includes('{matches_list}')) {
      return config.postTemplateHalfTimeRoundup
        .replace(/{count}/g, String(filtered.length))
        .replace(/{time}/g, timeStr)
        .replace(/{matches_list}/g, scoreboardContent)
        .replace(/#GameScores/g, '#Football');
    }
    return scoreboardContent;
  }

  // Standard Clean Half-Time Format with Dynamic Anti-Spam Variations or DeepSeek AI Copy
  const { matchesList, hashtags: defaultHashtags } = formatStandardHalfTimeRoundupMatches(filtered, config);

  const epoch5m = Math.floor(Date.now() / (5 * 60 * 1000));
  const seed = Math.abs(epoch5m + filtered.length + (filtered[0]?.id ? filtered[0].id.charCodeAt(0) : 0));

  const headline = aiCopy?.headline?.trim() || HT_HEADLINES[seed % HT_HEADLINES.length];
  const subheadGen = HT_SUBHEADS[seed % HT_SUBHEADS.length];
  const subhead = aiCopy?.subhead?.trim() || subheadGen(filtered.length, timeStr);
  const closing = aiCopy?.closing?.trim() || HT_CLOSINGS[seed % HT_CLOSINGS.length];
  const finalHashtags = aiCopy?.hashtags?.trim() || defaultHashtags;

  const customTemplate = config.postTemplateHalfTimeRoundup?.trim();
  const isDefaultOrEmpty =
    !customTemplate ||
    customTemplate.includes('⏸️ HALF-TIME SCORES') ||
    customTemplate.includes('#GameScores');

  if (isDefaultOrEmpty) {
    return `${headline}\n${subhead}\n\n${matchesList}\n\n${closing}\n${finalHashtags}`;
  }

  return customTemplate
    .replace(/{headline}/g, headline)
    .replace(/{subhead}/g, subhead)
    .replace(/{closing}/g, closing)
    .replace(/{count}/g, String(filtered.length))
    .replace(/{time}/g, timeStr)
    .replace(/{matches_list}/g, matchesList)
    .replace(/{hashtags}/g, finalHashtags)
    .replace(/#GameScores/g, '');
}

