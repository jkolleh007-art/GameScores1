import { Match, MatchEvent, MatchStats, MatchStatus, League, Team } from '../types.js';

export function parseFlashscoreFeed(rawText: string): Match[] {
  const blocks = rawText.split('¬~');
  const matches: Match[] = [];

  let currentLeague: League = {
    id: 'unknown',
    name: 'Football Match',
    country: 'World',
    countryCode: '',
  };

  for (const block of blocks) {
    if (!block.trim()) continue;

    const parts = block.split('¬');
    const data: Record<string, string> = {};
    for (const p of parts) {
      const idx = p.indexOf('÷');
      if (idx !== -1) {
        const k = p.slice(0, idx);
        const v = p.slice(idx + 1);
        data[k] = v;
      }
    }

    // Check if tournament header block
    if (data['ZA']) {
      const rawZa = data['ZA'];
      let country = data['ZY'] || 'World';
      let leagueName = rawZa;

      if (rawZa.includes(':')) {
        const partsZa = rawZa.split(':');
        country = partsZa[0].trim();
        leagueName = partsZa.slice(1).join(':').trim();
      }

      currentLeague = {
        id: data['ZC'] || data['ZEE'] || `league_${leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: leagueName,
        country: country,
        countryCode: data['ZB'] || '',
        flag: data['OAJ'] || '',
      };
    } else if (data['AA']) {
      // Match block
      const matchId = data['AA'];
      const homeName = data['AE'] || 'Home Team';
      const awayName = data['AF'] || 'Away Team';

      const rawHomeScore = data['AG'] ?? '-';
      const rawAwayScore = data['AH'] ?? '-';
      const homeScore = /^\d+$/.test(rawHomeScore) ? parseInt(rawHomeScore, 10) : 0;
      const awayScore = /^\d+$/.test(rawAwayScore) ? parseInt(rawAwayScore, 10) : 0;

      const statusCode = data['AB'] || '1';
      const stageCode = data['AC'] || '';
      let statusText = stageCode;
      let status: MatchStatus = 'SCHEDULED';
      let minute: number | undefined = undefined;

      let startTime = new Date().toISOString();
      let startTimestampMs = 0;
      if (data['AD']) {
        try {
          const ts = parseInt(data['AD'], 10);
          if (!isNaN(ts)) {
            startTimestampMs = ts * 1000;
            startTime = new Date(startTimestampMs).toISOString();
          }
        } catch {
          // Keep current time
        }
      }

      let secondHalfStartMs = 0;
      if (data['AO']) {
        try {
          const ts = parseInt(data['AO'], 10);
          if (!isNaN(ts)) {
            secondHalfStartMs = ts * 1000;
          }
        } catch {}
      }

      if (statusCode === '2') {
        // Active / In Play / Halftime
        const scLower = stageCode.toLowerCase().trim();
        const isTrueHalftime =
          stageCode === '38' ||
          stageCode.toUpperCase() === 'HT' ||
          scLower === 'half time' ||
          scLower === 'halftime' ||
          scLower === 'half-time' ||
          scLower === 'break';

        if (isTrueHalftime && !scLower.includes('1st') && !scLower.includes('2nd')) {
          status = 'PAUSED';
          minute = 45;
          statusText = "HT (45')";
        } else if (stageCode === '6' || stageCode.includes('ET 1')) {
          status = 'EXTRA_TIME';
          minute = 95;
          statusText = "ET (1st Half)";
        } else if (stageCode === '7' || stageCode.includes('ET 2')) {
          status = 'EXTRA_TIME';
          minute = 110;
          statusText = "ET (2nd Half)";
        } else if (stageCode === '8' || stageCode.includes('Pen')) {
          status = 'PENALTIES';
          statusText = "Penalties";
        } else if (stageCode === '13' || scLower.includes('2nd')) {
          // 2nd Half (Flashscore stage code 13)
          status = 'IN_PLAY';
          if (secondHalfStartMs > 0) {
            const elapsed2nd = Math.floor((Date.now() - secondHalfStartMs) / 60000);
            minute = 45 + Math.max(1, elapsed2nd);
          } else if (startTimestampMs > 0) {
            const elapsedTotal = Math.floor((Date.now() - startTimestampMs) / 60000);
            minute = Math.max(46, elapsedTotal - 15);
          } else {
            minute = 46;
          }
          statusText = `${minute}' (2nd Half)`;
        } else if (stageCode === '12' || stageCode === '46' || stageCode === '1' || scLower.includes('1st')) {
          // 1st Half (Flashscore stage code 12 or 46)
          status = 'IN_PLAY';
          if (startTimestampMs > 0) {
            const elapsed = Math.floor((Date.now() - startTimestampMs) / 60000);
            minute = Math.max(1, elapsed);
          } else {
            minute = 1;
          }
          statusText = `${minute}' (1st Half)`;
        } else {
          status = 'IN_PLAY';
          const minMatch = stageCode.match(/^(\d+)'?$/);
          if (minMatch && parseInt(minMatch[1], 10) <= 120 && minMatch[1] !== '13' && minMatch[1] !== '12' && minMatch[1] !== '38') {
            minute = parseInt(minMatch[1], 10);
            statusText = `${minute}'`;
          } else if (startTimestampMs > 0) {
            const elapsed = Math.floor((Date.now() - startTimestampMs) / 60000);
            if (elapsed >= 1 && elapsed <= 130) {
              minute = elapsed;
              statusText = `${minute}'`;
            }
          } else {
            statusText = 'LIVE';
          }
        }
      } else if (statusCode === '3') {
        status = 'FINISHED';
        statusText = 'FT (90\')';
        minute = 90;
      } else if (statusCode === '4' || statusCode === '9') {
        status = 'POSTPONED';
      } else if (statusCode === '5' || statusCode === '6') {
        status = 'CANCELLED';
      } else if (statusCode === '1') {
        status = 'SCHEDULED';
      }

      const homeTeam: Team = {
        id: data['CX'] || `team_${homeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: homeName,
      };

      const awayTeam: Team = {
        id: data['CY'] || `team_${awayName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: awayName,
      };

      let initialStats: MatchStats | undefined = undefined;
      const redCardsHome = data['DA'] ? parseInt(data['DA'], 10) : undefined;
      const redCardsAway = data['DB'] ? parseInt(data['DB'], 10) : undefined;
      if (redCardsHome !== undefined || redCardsAway !== undefined) {
        initialStats = {
          redCardsHome: redCardsHome || 0,
          redCardsAway: redCardsAway || 0,
        };
      }

      matches.push({
        id: matchId,
        provider: 'flashscore',
        league: { ...currentLeague },
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        status,
        statusText: statusText || (status === 'IN_PLAY' ? (minute ? `${minute}'` : 'Live') : status === 'FINISHED' ? 'FT (90\')' : 'Upcoming'),
        minute,
        startTime,
        stats: initialStats,
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  return matches;
}

export function parseFlashscoreEvents(matchId: string, rawText: string): MatchEvent[] {
  const blocks = rawText.split('¬~');
  const events: MatchEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    const parts = block.split('¬');
    const data: Record<string, string> = {};
    for (const p of parts) {
      const idx = p.indexOf('÷');
      if (idx !== -1) {
        data[p.slice(0, idx)] = p.slice(idx + 1);
      }
    }

    if (data['IB'] || data['IF']) {
      const rawMin = data['IB'] || '0';
      let minuteNum = 0;
      let extraMin: number | undefined = undefined;

      const minClean = rawMin.replace("'", '').trim();
      if (minClean.includes('+')) {
        const mParts = minClean.split('+');
        minuteNum = parseInt(mParts[0], 10) || 0;
        extraMin = parseInt(mParts[1], 10) || undefined;
      } else if (/^\d+$/.test(minClean)) {
        minuteNum = parseInt(minClean, 10);
      }

      const teamSide: 'home' | 'away' = data['IA'] === '1' ? 'home' : 'away';
      const playerName = data['IF'] || 'Player';
      const detailType = data['IK'] || '';
      const lowerDetail = detailType.toLowerCase();

      let eventType: MatchEvent['type'] = 'GOAL';
      let detail: string | undefined = undefined;

      if (lowerDetail.includes('yellow card')) {
        eventType = 'YELLOW_CARD';
      } else if (lowerDetail.includes('red card') || lowerDetail.includes('yellow/red')) {
        eventType = lowerDetail.includes('yellow/red') ? 'YELLOW_RED_CARD' : 'RED_CARD';
      } else if (lowerDetail.includes('substitution')) {
        eventType = 'SUBSTITUTION';
        detail = detailType;
      } else if (lowerDetail.includes('penalty')) {
        eventType = 'GOAL';
        detail = 'Penalty';
      } else if (lowerDetail.includes('own goal')) {
        eventType = 'GOAL';
        detail = 'Own Goal';
      } else if (lowerDetail.includes('assistance')) {
        eventType = 'GOAL';
        detail = 'Assisted';
      } else {
        eventType = 'GOAL';
        detail = detailType || undefined;
      }

      let homeSc: number | undefined = undefined;
      let awaySc: number | undefined = undefined;
      if (data['INX'] && /^\d+$/.test(data['INX'])) homeSc = parseInt(data['INX'], 10);
      if (data['IOX'] && /^\d+$/.test(data['IOX'])) awaySc = parseInt(data['IOX'], 10);

      const eventId = `ev_${matchId}_${minuteNum}_${teamSide}_${playerName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16)}`;

      events.push({
        id: eventId,
        matchId,
        type: eventType,
        minute: minuteNum,
        extraMinute: extraMin,
        teamSide,
        playerName,
        detail,
        homeScore: homeSc,
        awayScore: awaySc,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return events;
}

export function parseFlashscoreStatistics(rawText: string): MatchStats {
  const blocks = rawText.split('¬~');
  const stats: MatchStats = {};

  for (const block of blocks) {
    if (!block.trim()) continue;

    const parts = block.split('¬');
    const data: Record<string, string> = {};
    for (const p of parts) {
      const idx = p.indexOf('÷');
      if (idx !== -1) {
        data[p.slice(0, idx)] = p.slice(idx + 1);
      }
    }

    const statName = (data['SG'] || '').trim();
    const valHome = (data['SH'] || '').trim();
    const valAway = (data['SI'] || '').trim();

    if (!statName) continue;

    const parseNum = (s: string): number | undefined => {
      const clean = s.replace('%', '').trim();
      return /^\d+$/.test(clean) ? parseInt(clean, 10) : undefined;
    };

    const lower = statName.toLowerCase();
    if (lower.includes('possession')) {
      stats.possessionHome = parseNum(valHome);
      stats.possessionAway = parseNum(valAway);
    } else if (lower.includes('total shots')) {
      stats.shotsHome = parseNum(valHome);
      stats.shotsAway = parseNum(valAway);
    } else if (lower.includes('shots on target') || lower.includes('shots on goal')) {
      stats.shotsOnTargetHome = parseNum(valHome);
      stats.shotsOnTargetAway = parseNum(valAway);
    } else if (lower.includes('corner')) {
      stats.cornersHome = parseNum(valHome);
      stats.cornersAway = parseNum(valAway);
    } else if (lower.includes('foul')) {
      stats.foulsHome = parseNum(valHome);
      stats.foulsAway = parseNum(valAway);
    } else if (lower.includes('yellow')) {
      stats.yellowCardsHome = parseNum(valHome);
      stats.yellowCardsAway = parseNum(valAway);
    } else if (lower.includes('red')) {
      stats.redCardsHome = parseNum(valHome);
      stats.redCardsAway = parseNum(valAway);
    } else if (lower.includes('offside')) {
      stats.offsidesHome = parseNum(valHome);
      stats.offsidesAway = parseNum(valAway);
    } else if (lower.includes('save')) {
      stats.savesHome = parseNum(valHome);
      stats.savesAway = parseNum(valAway);
    }
  }

  return stats;
}
