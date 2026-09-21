import datetime
import re
from typing import Dict, List, Any, Optional

def parse_flashscore_feed(raw_text: str) -> List[Dict[str, Any]]:
    """
    Parse Flashscore's raw delimited feed (f_1_... format).
    Blocks are separated by '¬~', key-value pairs by '¬', and keys/values by '÷'.
    """
    blocks = raw_text.split('¬~')
    matches = []
    
    current_league = {
        'id': 'unknown',
        'name': 'Football Match',
        'country': 'World',
        'country_code': '',
    }

    for block in blocks:
        if not block.strip():
            continue
        
        parts = block.split('¬')
        data = {}
        for p in parts:
            if '÷' in p:
                k, v = p.split('÷', 1)
                data[k] = v

        # Check if tournament header block
        if 'ZA' in data:
            raw_za = data.get('ZA', '')
            country = data.get('ZY', 'World')
            league_name = raw_za
            
            # Often format is "COUNTRY: League Name"
            if ':' in raw_za:
                parts_za = raw_za.split(':', 1)
                country = parts_za[0].strip()
                league_name = parts_za[1].strip()

            current_league = {
                'id': data.get('ZC', data.get('ZEE', 'league_' + re.sub(r'[^a-zA-Z0-9]', '_', league_name.lower()))),
                'name': league_name,
                'country': country,
                'country_code': data.get('ZB', ''),
                'flag': data.get('OAJ', ''),
            }

        # Check if match block
        elif 'AA' in data:
            match_id = data.get('AA')
            home_name = data.get('AE', 'Home Team')
            away_name = data.get('AF', 'Away Team')
            
            # Scores
            raw_home_score = data.get('AG', '-')
            raw_away_score = data.get('AH', '-')
            home_score = int(raw_home_score) if raw_home_score.isdigit() else 0
            away_score = int(raw_away_score) if raw_away_score.isdigit() else 0

            # Match status mapping
            # AB: 1 = Scheduled, 2 = Live / In progress, 3 = Finished, 4 = Postponed, 5 = Cancelled, etc.
            status_code = data.get('AB', '1')
            status_text = data.get('AC', '')
            status = 'SCHEDULED'
            minute: Optional[int] = None

            if status_code == '2':
                # In play or paused
                if 'HT' in status_text or 'Half' in status_text:
                    status = 'PAUSED'
                elif 'ET' in status_text:
                    status = 'EXTRA_TIME'
                elif 'Pen' in status_text:
                    status = 'PENALTIES'
                else:
                    status = 'IN_PLAY'
                
                # Extract minute if available
                min_match = re.search(r'(\d+)', status_text)
                if min_match:
                    minute = int(min_match.group(1))
            elif status_code == '3':
                status = 'FINISHED'
                if not status_text:
                    status_text = 'Finished'
            elif status_code in ('4', '9'):
                status = 'POSTPONED'
            elif status_code in ('5', '6'):
                status = 'CANCELLED'
            elif status_code == '1':
                status = 'SCHEDULED'
                if not status_text and 'AD' in data:
                    try:
                        ts = int(data['AD'])
                        status_text = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime('%H:%M')
                    except:
                        status_text = 'Upcoming'

            # Start time
            start_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            if 'AD' in data:
                try:
                    start_ts = int(data['AD'])
                    start_iso = datetime.datetime.fromtimestamp(start_ts, tz=datetime.timezone.utc).isoformat()
                except:
                    pass

            matches.append({
                'id': match_id,
                'provider': 'flashscore',
                'league': {
                    'id': current_league['id'],
                    'name': current_league['name'],
                    'country': current_league['country'],
                    'countryCode': current_league['country_code'],
                    'flag': current_league.get('flag', ''),
                },
                'homeTeam': {
                    'id': data.get('CX', f"team_{re.sub(r'[^a-zA-Z0-9]', '_', home_name.lower())}"),
                    'name': home_name,
                },
                'awayTeam': {
                    'id': data.get('CY', f"team_{re.sub(r'[^a-zA-Z0-9]', '_', away_name.lower())}"),
                    'name': away_name,
                },
                'homeScore': home_score,
                'awayScore': away_score,
                'status': status,
                'statusText': status_text or ('Live' if status == 'IN_PLAY' else status),
                'minute': minute,
                'startTime': start_iso,
                'lastUpdated': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })

    return matches

def parse_flashscore_events(match_id: str, raw_text: str) -> List[Dict[str, Any]]:
    """
    Parse Flashscore's match summary/incidents feed (df_su_1_... format).
    """
    blocks = raw_text.split('¬~')
    events = []

    for block in blocks:
        if not block.strip():
            continue
        parts = block.split('¬')
        data = {}
        for p in parts:
            if '÷' in p:
                k, v = p.split('÷', 1)
                data[k] = v

        # Key incident markers:
        # IB = Minute (e.g. 45+3' or 62')
        # IA = Team side (1 = Home, 2 = Away)
        # IF = Player name
        # IK = Incident description / type (e.g. "Goal", "Penalty", "Yellow Card", "Substitution - In")
        # INX / IOX = New scoreline
        if 'IB' in data or 'IF' in data:
            raw_min = data.get('IB', '0')
            minute_num = 0
            extra_min: Optional[int] = None
            
            # Parse minutes like "45+2'" or "78'"
            min_clean = raw_min.replace("'", "").strip()
            if '+' in min_clean:
                try:
                    m_parts = min_clean.split('+')
                    minute_num = int(m_parts[0])
                    extra_min = int(m_parts[1])
                except:
                    pass
            elif min_clean.isdigit():
                minute_num = int(min_clean)

            team_side = 'home' if data.get('IA') == '1' else 'away'
            player_name = data.get('IF', 'Player')
            detail_type = data.get('IK', '')
            
            # Normalize event type
            event_type = 'GOAL'
            detail = None
            lower_detail = detail_type.lower()
            
            if 'yellow card' in lower_detail:
                event_type = 'YELLOW_CARD'
            elif 'red card' in lower_detail or 'yellow/red' in lower_detail:
                event_type = 'RED_CARD'
                if 'yellow/red' in lower_detail:
                    event_type = 'YELLOW_RED_CARD'
            elif 'substitution' in lower_detail:
                event_type = 'SUBSTITUTION'
                detail = detail_type
            elif 'penalty' in lower_detail:
                event_type = 'GOAL'
                detail = 'Penalty'
            elif 'own goal' in lower_detail:
                event_type = 'GOAL'
                detail = 'Own Goal'
            elif 'assistance' in lower_detail:
                event_type = 'GOAL'
                detail = 'Assisted'
            else:
                event_type = 'GOAL'
                detail = detail_type or None

            # Scoreline
            home_sc: Optional[int] = None
            away_sc: Optional[int] = None
            if 'INX' in data and data['INX'].isdigit():
                home_sc = int(data['INX'])
            if 'IOX' in data and data['IOX'].isdigit():
                away_sc = int(data['IOX'])

            event_id = f"ev_{match_id}_{minute_num}_{team_side}_{re.sub(r'[^a-zA-Z0-9]', '_', player_name.lower())[:16]}"

            events.append({
                'id': event_id,
                'matchId': match_id,
                'type': event_type,
                'minute': minute_num,
                'extraMinute': extra_min,
                'teamSide': team_side,
                'playerName': player_name,
                'secondaryPlayerName': None,
                'detail': detail,
                'homeScore': home_sc,
                'awayScore': away_sc,
                'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })

    return events

def parse_flashscore_statistics(match_id: str, raw_text: str) -> Dict[str, Any]:
    """
    Parse Flashscore's statistics feed (df_st_1_... format).
    """
    blocks = raw_text.split('¬~')
    stats: Dict[str, Any] = {}

    for block in blocks:
        if not block.strip():
            continue
        parts = block.split('¬')
        data = {}
        for p in parts:
            if '÷' in p:
                k, v = p.split('÷', 1)
                data[k] = v

        stat_name = data.get('SG', '').strip()
        val_home = data.get('SH', '').strip()
        val_away = data.get('SI', '').strip()

        if not stat_name:
            continue

        def parse_stat_num(s: str) -> Optional[int]:
            s_clean = s.replace('%', '').strip()
            if s_clean.isdigit():
                return int(s_clean)
            return None

        lower_name = stat_name.lower()
        if 'possession' in lower_name:
            stats['possessionHome'] = parse_stat_num(val_home)
            stats['possessionAway'] = parse_stat_num(val_away)
        elif 'total shots' in lower_name:
            stats['shotsHome'] = parse_stat_num(val_home)
            stats['shotsAway'] = parse_stat_num(val_away)
        elif 'shots on target' in lower_name:
            stats['shotsOnTargetHome'] = parse_stat_num(val_home)
            stats['shotsOnTargetAway'] = parse_stat_num(val_away)
        elif 'corner' in lower_name:
            stats['cornersHome'] = parse_stat_num(val_home)
            stats['cornersAway'] = parse_stat_num(val_away)
        elif 'fouls' in lower_name:
            stats['foulsHome'] = parse_stat_num(val_home)
            stats['foulsAway'] = parse_stat_num(val_away)
        elif 'yellow' in lower_name:
            stats['yellowCardsHome'] = parse_stat_num(val_home)
            stats['yellowCardsAway'] = parse_stat_num(val_away)
        elif 'red' in lower_name:
            stats['redCardsHome'] = parse_stat_num(val_home)
            stats['redCardsAway'] = parse_stat_num(val_away)
        elif 'offsides' in lower_name:
            stats['offsidesHome'] = parse_stat_num(val_home)
            stats['offsidesAway'] = parse_stat_num(val_away)
        elif 'saves' in lower_name:
            stats['savesHome'] = parse_stat_num(val_home)
            stats['savesAway'] = parse_stat_num(val_away)

    return stats
