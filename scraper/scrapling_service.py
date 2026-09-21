import os
import sys
import time
import json
import logging
from flask import Flask, jsonify, request
import requests
import scrapling
from scrapling import Fetcher
from flashscore_parser import (
    parse_flashscore_feed,
    parse_flashscore_events,
    parse_flashscore_statistics,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('ScraplingService')

app = Flask(__name__)

PORT = int(os.environ.get('SCRAPLING_PORT', 5001))
FLASHSCORE_BASE = 'https://local-global.flashscore.ninja/2/x/feed'
FLASHSCORE_FALLBACKS = [
    'https://local-global.flashscore.ninja/2/x/feed',
    'https://2.flashscore.ninja/2/x/feed',
    'https://www.flashscore.com/x/feed',
]

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.flashscore.com/',
    'x-fsign': 'SW9D1eZo',
    'Accept-Language': 'en-GB,en;q=0.9',
}

session = requests.Session()
session.headers.update(DEFAULT_HEADERS)

def fetch_feed_with_fallback(feed_path: str, timeout: int = 8) -> str:
    """
    Fetches Flashscore feed, rotating through verified endpoints.
    """
    last_err = None
    for base in FLASHSCORE_FALLBACKS:
        url = f"{base}/{feed_path}"
        try:
            resp = session.get(url, timeout=timeout)
            if resp.status_code == 200 and len(resp.text) > 0:
                return resp.text
            elif resp.status_code == 200:
                return resp.text
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    return ""

@app.route('/health', methods=['GET'])
def health():
    t0 = time.time()
    # Check Scrapling and upstream accessibility
    upstream_ok = False
    try:
        page = Fetcher.get('https://www.flashscore.com/', headers={'User-Agent': DEFAULT_HEADERS['User-Agent']})
        upstream_ok = page.status == 200
    except Exception as e:
        logger.warning(f"Health check fetcher warning: {e}")

    latency = int((time.time() - t0) * 1000)
    return jsonify({
        'service': 'python_scrapling',
        'status': 'ONLINE' if upstream_ok else 'DEGRADED',
        'scrapling_version': getattr(scrapling, '__version__', '0.4.15'),
        'upstream_accessible': upstream_ok,
        'latency_ms': latency,
        'timestamp': time.time(),
    })

@app.route('/matches/live', methods=['GET'])
def get_live_matches():
    try:
        # f_1_0_2_en-uk_1 returns live in-play matches
        raw = fetch_feed_with_fallback('f_1_0_2_en-uk_1')
        matches = parse_flashscore_feed(raw)
        # Filter for live statuses
        live = [m for m in matches if m['status'] in ('IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTIES')]
        return jsonify({
            'success': True,
            'count': len(live),
            'total_parsed': len(matches),
            'data': live,
        })
    except Exception as e:
        logger.error(f"Error fetching live matches: {e}")
        return jsonify({'success': False, 'error': str(e), 'data': []}), 500

@app.route('/matches/today', methods=['GET'])
def get_today_matches():
    try:
        raw = fetch_feed_with_fallback('f_1_0_1_en-uk_1')
        matches = parse_flashscore_feed(raw)
        return jsonify({
            'success': True,
            'count': len(matches),
            'data': matches,
        })
    except Exception as e:
        logger.error(f"Error fetching today matches: {e}")
        return jsonify({'success': False, 'error': str(e), 'data': []}), 500

@app.route('/matches/fixtures', methods=['GET'])
def get_fixtures():
    offset = request.args.get('offset', '1') # +1 = tomorrow
    try:
        raw = fetch_feed_with_fallback(f'f_1_{offset}_4_en-uk_1')
        matches = parse_flashscore_feed(raw)
        fixtures = [m for m in matches if m['status'] == 'SCHEDULED']
        return jsonify({
            'success': True,
            'offset': offset,
            'count': len(fixtures),
            'data': fixtures,
        })
    except Exception as e:
        logger.error(f"Error fetching fixtures: {e}")
        return jsonify({'success': False, 'error': str(e), 'data': []}), 500

@app.route('/matches/results', methods=['GET'])
def get_results():
    offset = request.args.get('offset', '-1') # -1 = yesterday
    try:
        raw = fetch_feed_with_fallback(f'f_1_{offset}_3_en-uk_1')
        matches = parse_flashscore_feed(raw)
        results = [m for m in matches if m['status'] == 'FINISHED']
        return jsonify({
            'success': True,
            'offset': offset,
            'count': len(results),
            'data': results,
        })
    except Exception as e:
        logger.error(f"Error fetching results: {e}")
        return jsonify({'success': False, 'error': str(e), 'data': []}), 500

@app.route('/match/<match_id>', methods=['GET'])
def get_match_detail(match_id):
    try:
        # df_sur_1_{match_id} gives match overview/referee/stadium/half scores
        raw_sur = fetch_feed_with_fallback(f'df_sur_1_{match_id}')
        # Also fetch events and stats
        raw_su = fetch_feed_with_fallback(f'df_su_1_{match_id}')
        raw_st = fetch_feed_with_fallback(f'df_st_1_{match_id}')

        events = parse_flashscore_events(match_id, raw_su)
        stats = parse_flashscore_statistics(match_id, raw_st)

        return jsonify({
            'success': True,
            'matchId': match_id,
            'events': events,
            'stats': stats,
            'rawSurPresent': len(raw_sur) > 10,
        })
    except Exception as e:
        logger.error(f"Error fetching match detail {match_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/match/<match_id>/events', methods=['GET'])
def get_match_events(match_id):
    try:
        raw_su = fetch_feed_with_fallback(f'df_su_1_{match_id}')
        events = parse_flashscore_events(match_id, raw_su)
        return jsonify({
            'success': True,
            'matchId': match_id,
            'count': len(events),
            'data': events,
        })
    except Exception as e:
        logger.error(f"Error fetching match events {match_id}: {e}")
        return jsonify({'success': False, 'error': str(e), 'data': []}), 500

@app.route('/match/<match_id>/stats', methods=['GET'])
def get_match_stats(match_id):
    try:
        raw_st = fetch_feed_with_fallback(f'df_st_1_{match_id}')
        stats = parse_flashscore_statistics(match_id, raw_st)
        return jsonify({
            'success': True,
            'matchId': match_id,
            'data': stats,
        })
    except Exception as e:
        logger.error(f"Error fetching match stats {match_id}: {e}")
        return jsonify({'success': False, 'error': str(e), 'data': {}}), 500

if __name__ == '__main__':
    logger.info(f"Starting Python Scrapling Scraper Service on port {PORT}...")
    app.run(host='127.0.0.1', port=PORT, threaded=True)
