import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

import { config } from './server/config.js';
import { db } from './server/db/index.js';
import { cache } from './server/cache/redis.js';
import { scraplingSupervisor } from './server/scraper/supervisor.js';
import { sportsSync } from './server/sync/sports_sync.js';
import { flashscoreClient } from './server/scraper/flashscore_client.js';
import { publisherQueue } from './server/publisher/queue.js';
import { facebookPublisher } from './server/publisher/facebook_publisher.js';
import { fbClient } from './server/publisher/facebook_client.js';
import { formatLiveRoundupPost, formatResultsRoundupPost, formatHalfTimeRoundupPost, isMatchAtHalfTime } from './server/publisher/templates.js';
import { DeepseekGenerator, AiGeneratedCopy } from './server/publisher/deepseek_generator.js';
import { FacebookPageConfig, Match, DailyLeagueSelection } from './server/types.js';

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  // Initialize persistence and cache
  await db.init();
  await cache.init();

  // Initialize Facebook publisher background queue
  await publisherQueue.init();

  // Start Scrapling Python process supervisor
  await scraplingSupervisor.start();

  // Setup WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });
  const connectedClients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log(`[WebSocket] Client connected. Total active: ${connectedClients.size}`);

    // Send initial handshake and system state
    ws.send(JSON.stringify({
      type: 'connected',
      payload: {
        serverTime: new Date().toISOString(),
        clients: connectedClients.size,
      },
    }));

    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log(`[WebSocket] Client disconnected. Total active: ${connectedClients.size}`);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (e) {}
    });
  });

  // Broadcast helper
  const broadcast = (type: string, payload: any) => {
    const msg = JSON.stringify({ type, payload });
    for (const ws of connectedClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  };

  // Wire sync engine with WebSocket broadcast
  sportsSync.setBroadcast(broadcast);

  // Start sports sync engine (polling Flashscore via Scrapling) if enabled in settings
  setTimeout(async () => {
    try {
      const sysSettings = await db.getSettings<{ scraplingEnabled: boolean }>('systemConfig', {
        scraplingEnabled: true,
      });
      if (sysSettings.scraplingEnabled !== false) {
        await sportsSync.start();
      } else {
        console.log('[Main] Scrapling sports sync engine is currently STOPPED per administrator setting.');
      }
    } catch (err) {
      console.error('[Main] Failed to initialize sports sync:', err);
    }
  }, 2000);

  // -------------------------------------------------------------
  // REST API Routes
  // -------------------------------------------------------------

  // Admin Authentication Middleware
  const adminAuthMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (req.headers['x-admin-token']) {
        token = String(req.headers['x-admin-token']).trim();
      }

      // API Admin Key fallback for external cron jobs or scripts
      const apiKey = req.headers['x-api-key'];
      if (config.apiAdminKey && apiKey === config.apiAdminKey) {
        (req as any).adminUser = {
          id: 'api_admin',
          username: 'API Key Admin',
          role: 'superadmin',
        };
        return next();
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Administrator authentication required. Please sign in.',
          requireLogin: true,
        });
      }

      const session = await db.validateSession(token);
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Administrator session expired or invalid. Please sign in again.',
          requireLogin: true,
        });
      }

      (req as any).adminUser = {
        id: session.adminId,
        username: session.username,
        role: session.role,
      };
      next();
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Authentication error: ' + err.message });
    }
  };

  // -------------------------------------------------------------
  // Admin Authentication Routes
  // -------------------------------------------------------------

  // Admin Status: Check current session and database connection info
  app.get('/api/admin/status', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (req.headers['x-admin-token']) {
        token = String(req.headers['x-admin-token']).trim();
      }

      let currentUser: any = null;
      if (token) {
        const session = await db.validateSession(token);
        if (session) {
          currentUser = {
            id: session.adminId,
            username: session.username,
            role: session.role,
          };
        }
      }

      const totalAdmins = await db.getAdminCount();
      const dbInfo = db.getConnectionInfo();

      res.json({
        success: true,
        isAuthenticated: Boolean(currentUser),
        user: currentUser,
        totalAdmins,
        database: dbInfo,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin Login: Authenticate username & password
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
      }

      const admin = await db.getAdminByUsername(username);
      if (!admin) {
        return res.status(401).json({ success: false, error: 'Invalid username or password.' });
      }

      const hash = db.hashPassword(password, admin.salt);
      if (hash !== admin.passwordHash) {
        return res.status(401).json({ success: false, error: 'Invalid username or password.' });
      }

      await db.updateAdminLastLogin(admin.id);
      const session = await db.createSession(admin.id, admin.username, admin.role);

      res.json({
        success: true,
        message: `Welcome back, ${admin.username}!`,
        token: session.token,
        user: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
        },
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin Logout: Invalidate current token
  app.post('/api/admin/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      let token = req.body?.token;
      if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (!token && req.headers['x-admin-token']) {
        token = String(req.headers['x-admin-token']).trim();
      }

      if (token) {
        await db.deleteSession(token);
      }

      res.json({ success: true, message: 'Signed out successfully.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin Profile: Get current logged-in admin
  app.get('/api/admin/me', adminAuthMiddleware, async (req, res) => {
    const user = (req as any).adminUser;
    const dbInfo = db.getConnectionInfo();
    res.json({ success: true, user, database: dbInfo });
  });

  // Admin: Change current admin password
  app.post('/api/admin/change-password', adminAuthMiddleware, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
      }

      const user = (req as any).adminUser;
      const admin = await db.getAdminByUsername(user.username);
      if (!admin) {
        return res.status(404).json({ success: false, error: 'Admin account not found.' });
      }

      const oldHash = db.hashPassword(oldPassword, admin.salt);
      if (oldHash !== admin.passwordHash) {
        return res.status(400).json({ success: false, error: 'Current password does not match.' });
      }

      await db.updateAdminPassword(admin.id, newPassword);
      res.json({ success: true, message: 'Admin password updated successfully.' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: List all admin accounts
  app.get('/api/admin/users', adminAuthMiddleware, async (req, res) => {
    try {
      const users = await db.getAdminUsers();
      res.json({ success: true, count: users.length, data: users });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: Create additional admin account
  app.post('/api/admin/create-user', adminAuthMiddleware, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
      }

      const created = await db.createAdminUser({
        username,
        password,
        role: role || 'admin',
      });

      res.json({
        success: true,
        message: `Admin user "${created.username}" created successfully.`,
        data: created,
      });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // System status and monitoring
  app.get('/api/system/status', async (req, res) => {
    let scraplingHealth: any = { status: 'OFFLINE' };
    try {
      const resp = await fetch(`${config.scraplingUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        scraplingHealth = await resp.json();
      } else {
        scraplingHealth = flashscoreClient.getStatus();
      }
    } catch {
      scraplingHealth = flashscoreClient.getStatus();
    }

    const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
      pageId: config.fbPageId,
      isConnected: false,
      autoPublishEnabled: false,
      publishGoals: true,
      publishRedCards: true,
      publishKickoff: true,
      publishHalfTime: true,
      publishFullTime: true,
      includeStatsInFullTime: true,
      targetLeagueIds: [],
      postTemplateGoal: '',
      postTemplateRedCard: '',
      postTemplateKickoff: '',
      postTemplateHalfTime: '',
      postTemplateFullTime: '',
    });

    const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
    const dbInfo = db.getConnectionInfo();
    const adminCount = await db.getAdminCount();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      nodeApi: {
        status: 'ONLINE',
        uptime: process.uptime(),
        port: config.port,
        connectedWsClients: connectedClients.size,
      },
      scraplingService: scraplingHealth,
      syncEngine: sportsSync.getStatus(),
      dailyLeagueSelection: {
        date: dailySelection.date,
        selectedCount: dailySelection.selectedLeagueIds.length,
        selectedLeagueNames: dailySelection.selectedLeagueNames,
        isConfigured: dailySelection.selectedLeagueIds.length > 0,
      },
      adminAuth: {
        enabled: true,
        totalAdmins: adminCount,
        dbType: dbInfo.dbType,
      },
      facebookPublisher: {
        config: {
          pageId: fbConfig.pageId || null,
          isConnected: Boolean(fbConfig.isConnected && fbConfig.pageId),
          autoPublishEnabled: false,
          targetLeagueIds: dailySelection.selectedLeagueIds || [],
        },
        queue: publisherQueue.getMetrics(),
      },
      persistence: {
        type: dbInfo.dbType,
        connected: true,
      },
      cache: {
        type: config.redisUrl ? 'Redis' : 'In-Memory Fallback',
        connected: true,
      },
    });
  });

  // Trigger manual sync (forced execution even if polling is paused)
  app.post('/api/system/sync', adminAuthMiddleware, async (req, res) => {
    try {
      const matches = await sportsSync.syncLiveMatches(true);
      res.json({
        success: true,
        message: 'Sync completed successfully',
        matchCount: matches.length,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Stop Scrapling Sync Engine
  app.post('/api/system/stop-scrapling', async (req, res) => {
    try {
      sportsSync.stop();
      await db.saveSettings('systemConfig', { scraplingEnabled: false });
      const status = sportsSync.getStatus();
      if (broadcast) {
        broadcast('scrapling_status_changed', {
          isRunning: false,
          status,
        });
      }
      console.log('[API] Scrapling engine stopped by user.');
      res.json({
        success: true,
        isRunning: false,
        message: 'Scrapling sports sync engine stopped successfully.',
        syncEngine: status,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Start Scrapling Sync Engine
  app.post('/api/system/start-scrapling', async (req, res) => {
    try {
      await db.saveSettings('systemConfig', { scraplingEnabled: true });
      await sportsSync.start();
      const status = sportsSync.getStatus();
      if (broadcast) {
        broadcast('scrapling_status_changed', {
          isRunning: true,
          status,
        });
      }
      console.log('[API] Scrapling engine started by user.');
      res.json({
        success: true,
        isRunning: true,
        message: 'Scrapling sports sync engine started successfully.',
        syncEngine: status,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Toggle Scrapling Sync Engine (Stop if running, Start if stopped)
  app.post('/api/system/toggle-scrapling', async (req, res) => {
    try {
      const current = sportsSync.getStatus();
      if (current.isRunning) {
        sportsSync.stop();
        await db.saveSettings('systemConfig', { scraplingEnabled: false });
      } else {
        await db.saveSettings('systemConfig', { scraplingEnabled: true });
        await sportsSync.start();
      }
      const newStatus = sportsSync.getStatus();
      if (broadcast) {
        broadcast('scrapling_status_changed', {
          isRunning: newStatus.isRunning,
          status: newStatus,
        });
      }
      console.log(`[API] Scrapling engine toggled: isRunning=${newStatus.isRunning}`);
      res.json({
        success: true,
        isRunning: newStatus.isRunning,
        message: newStatus.isRunning ? 'Scrapling engine started.' : 'Scrapling engine stopped.',
        syncEngine: newStatus,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Sports: Live Matches (Filtered strictly to leagues selected for today)
  app.get('/api/matches/live', async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      let matches: Match[] = [];
      const cached = await cache.getLiveMatches();
      if (cached && cached.length > 0) {
        matches = cached;
      } else {
        matches = await sportsSync.syncLiveMatches();
      }

      // Strictly filter to leagues selected by admin for today.
      // Games from unselected leagues are not displayed or posted.
      const filtered = dailySelection.selectedLeagueIds.length > 0
        ? matches.filter(m => m.league?.id && dailySelection.selectedLeagueIds.includes(m.league.id))
        : [];

      res.json({
        success: true,
        count: filtered.length,
        totalUnfiltered: matches.length,
        dailySelectionDate: dailySelection.date,
        selectedLeagueCount: dailySelection.selectedLeagueIds.length,
        source: cached && cached.length > 0 ? 'cache' : 'live_feed',
        data: filtered,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Sports: Today's matches (Filtered strictly to leagues selected for today)
  app.get('/api/matches/today', async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
      const matches = await sportsSync.getTodayMatches();

      const filtered = dailySelection.selectedLeagueIds.length > 0
        ? matches.filter(m => m.league?.id && dailySelection.selectedLeagueIds.includes(m.league.id))
        : [];

      res.json({
        success: true,
        count: filtered.length,
        totalUnfiltered: matches.length,
        dailySelectionDate: dailySelection.date,
        selectedLeagueCount: dailySelection.selectedLeagueIds.length,
        data: filtered,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Sports: Fixtures (Filtered strictly to leagues selected for today)
  app.get('/api/matches/fixtures', async (req, res) => {
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : 1;
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
      const matches = await sportsSync.getFixtures(offset);

      const filtered = dailySelection.selectedLeagueIds.length > 0
        ? matches.filter(m => m.league?.id && dailySelection.selectedLeagueIds.includes(m.league.id))
        : [];

      res.json({
        success: true,
        offset,
        count: filtered.length,
        totalUnfiltered: matches.length,
        dailySelectionDate: dailySelection.date,
        selectedLeagueCount: dailySelection.selectedLeagueIds.length,
        data: filtered,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Sports: Results (Filtered strictly to leagues selected for today)
  app.get('/api/matches/results', async (req, res) => {
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : -1;
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
      const matches = await sportsSync.getResults(offset);

      const filtered = dailySelection.selectedLeagueIds.length > 0
        ? matches.filter(m => m.league?.id && dailySelection.selectedLeagueIds.includes(m.league.id))
        : [];

      res.json({
        success: true,
        offset,
        count: filtered.length,
        totalUnfiltered: matches.length,
        dailySelectionDate: dailySelection.date,
        selectedLeagueCount: dailySelection.selectedLeagueIds.length,
        data: filtered,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Sports: Available Leagues (Aggregated across live matches, today's schedule, and results)
  app.get('/api/leagues', async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      const [liveMatches, todayMatches, resultsMatches] = await Promise.all([
        sportsSync.getLiveMatches().catch(() => [] as Match[]),
        sportsSync.getTodayMatches().catch(() => [] as Match[]),
        sportsSync.getResults(0).catch(() => [] as Match[]),
      ]);

      const leagueMap = new Map<string, {
        id: string;
        name: string;
        country: string;
        flag?: string;
        matchCount: number;
        liveCount: number;
        todayCount: number;
        isSelected: boolean;
      }>();

      const processMatches = (list: Match[], isLive: boolean, isToday: boolean) => {
        if (!Array.isArray(list)) return;
        for (const m of list) {
          if (!m.league || !m.league.id) continue;
          const id = m.league.id;
          if (!leagueMap.has(id)) {
            leagueMap.set(id, {
              id: m.league.id,
              name: m.league.name || 'Unknown League',
              country: m.league.country || 'World',
              flag: m.league.flag || '',
              matchCount: 1,
              liveCount: isLive ? 1 : 0,
              todayCount: isToday ? 1 : 0,
              isSelected: dailySelection.selectedLeagueIds.includes(id),
            });
          } else {
            const entry = leagueMap.get(id)!;
            entry.matchCount += 1;
            if (isLive) entry.liveCount += 1;
            if (isToday) entry.todayCount += 1;
            if (!entry.flag && m.league.flag) entry.flag = m.league.flag;
          }
        }
      };

      processMatches(liveMatches, true, true);
      processMatches(todayMatches, false, true);
      processMatches(resultsMatches, false, false);

      const leagues = Array.from(leagueMap.values()).sort((a, b) => {
        if (a.liveCount > 0 && b.liveCount === 0) return -1;
        if (b.liveCount > 0 && a.liveCount === 0) return 1;
        if (a.todayCount > 0 && b.todayCount === 0) return -1;
        if (b.todayCount > 0 && a.todayCount === 0) return 1;
        if (a.country !== b.country) return a.country.localeCompare(b.country);
        return a.name.localeCompare(b.name);
      });

      res.json({
        success: true,
        count: leagues.length,
        selectedCount: dailySelection.selectedLeagueIds.length,
        dailySelectionDate: dailySelection.date,
        data: leagues,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Sports: Daily League Selection Status & Full Directory
  app.get('/api/leagues/daily-selection', async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      const [liveMatches, todayMatches, resultsMatches] = await Promise.all([
        sportsSync.getLiveMatches().catch(() => [] as Match[]),
        sportsSync.getTodayMatches().catch(() => [] as Match[]),
        sportsSync.getResults(0).catch(() => [] as Match[]),
      ]);

      const leagueMap = new Map<string, {
        id: string;
        name: string;
        country: string;
        flag?: string;
        totalCount: number;
        liveCount: number;
        todayCount: number;
        isSelected: boolean;
      }>();

      const processLeagueItem = (m: Match, isLive: boolean, isToday: boolean) => {
        if (!m.league || !m.league.id) return;
        const id = m.league.id;
        if (!leagueMap.has(id)) {
          leagueMap.set(id, {
            id,
            name: m.league.name || 'Unknown League',
            country: m.league.country || 'World',
            flag: m.league.flag || '',
            totalCount: 1,
            liveCount: isLive ? 1 : 0,
            todayCount: isToday ? 1 : 0,
            isSelected: dailySelection.selectedLeagueIds.includes(id),
          });
        } else {
          const entry = leagueMap.get(id)!;
          entry.totalCount += 1;
          if (isLive) entry.liveCount += 1;
          if (isToday) entry.todayCount += 1;
          if (!entry.flag && m.league.flag) entry.flag = m.league.flag;
        }
      };

      for (const m of liveMatches) processLeagueItem(m, true, true);
      for (const m of todayMatches) processLeagueItem(m, false, true);
      for (const m of resultsMatches) processLeagueItem(m, false, false);

      const availableLeagues = Array.from(leagueMap.values()).sort((a, b) => {
        if (a.liveCount > 0 && b.liveCount === 0) return -1;
        if (b.liveCount > 0 && a.liveCount === 0) return 1;
        if (a.todayCount > 0 && b.todayCount === 0) return -1;
        if (b.todayCount > 0 && a.todayCount === 0) return 1;
        if (a.country !== b.country) return a.country.localeCompare(b.country);
        return a.name.localeCompare(b.name);
      });

      res.json({
        success: true,
        data: dailySelection,
        currentDate: dailySelection.date,
        timezone: fbConfig.timezone || 'UTC',
        selectedCount: dailySelection.selectedLeagueIds.length,
        totalAvailableLeagues: availableLeagues.length,
        availableLeagues,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Sports: Save Daily League Selection
  app.post('/api/leagues/daily-selection', adminAuthMiddleware, async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const { selectedLeagueIds, selectedLeagueNames, allLeaguesSelected } = req.body;

      if (!Array.isArray(selectedLeagueIds)) {
        return res.status(400).json({ success: false, error: 'selectedLeagueIds must be an array of league IDs' });
      }

      const updated = await db.saveDailyLeagueSelection(
        {
          selectedLeagueIds,
          selectedLeagueNames: Array.isArray(selectedLeagueNames) ? selectedLeagueNames : [],
          allLeaguesSelected: Boolean(allLeaguesSelected),
        },
        fbConfig.timezone || 'UTC'
      );

      // Broadcast update to all connected WebSocket clients so UI refreshes instantly
      broadcast('daily_leagues_updated', {
        date: updated.date,
        selectedLeagueIds: updated.selectedLeagueIds,
        selectedLeagueNames: updated.selectedLeagueNames,
        count: updated.selectedLeagueIds.length,
        allLeaguesSelected: updated.allLeaguesSelected,
      });

      res.json({
        success: true,
        message: `Successfully saved ${updated.selectedLeagueIds.length} selected league(s) for today (${updated.date}).`,
        data: updated,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Sports: Reset Daily League Selection (Deselect all)
  app.post('/api/leagues/daily-selection/reset', adminAuthMiddleware, async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const reset = await db.resetDailyLeagueSelection(fbConfig.timezone || 'UTC');

      broadcast('daily_leagues_updated', {
        date: reset.date,
        selectedLeagueIds: [],
        selectedLeagueNames: [],
        count: 0,
        reset: true,
      });

      res.json({
        success: true,
        message: `Successfully cleared league selection for today (${reset.date}). No games will be displayed or posted until leagues are selected.`,
        data: reset,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Sports: Select All Leagues for Today
  app.post('/api/leagues/daily-selection/select-all', adminAuthMiddleware, async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);

      const [liveMatches, todayMatches, resultsMatches] = await Promise.all([
        sportsSync.getLiveMatches().catch(() => [] as Match[]),
        sportsSync.getTodayMatches().catch(() => [] as Match[]),
        sportsSync.getResults(0).catch(() => [] as Match[]),
      ]);

      const idMap = new Map<string, string>();
      const addMatches = (list: Match[]) => {
        if (!Array.isArray(list)) return;
        for (const m of list) {
          if (m.league?.id) {
            idMap.set(m.league.id, m.league.name || 'Unknown League');
          }
        }
      };
      addMatches(liveMatches);
      addMatches(todayMatches);
      addMatches(resultsMatches);

      const allIds = Array.from(idMap.keys());
      const allNames = Array.from(idMap.values());

      const updated = await db.saveDailyLeagueSelection(
        {
          selectedLeagueIds: allIds,
          selectedLeagueNames: allNames,
          allLeaguesSelected: true,
        },
        fbConfig.timezone || 'UTC'
      );

      broadcast('daily_leagues_updated', {
        date: updated.date,
        selectedLeagueIds: updated.selectedLeagueIds,
        selectedLeagueNames: updated.selectedLeagueNames,
        count: updated.selectedLeagueIds.length,
        allLeaguesSelected: true,
      });

      res.json({
        success: true,
        message: `Successfully selected all ${allIds.length} available league(s) for today (${updated.date}).`,
        data: updated,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Sports: Single Match Details
  app.get('/api/matches/:id', async (req, res) => {
    const matchId = req.params.id;
    try {
      const [match, events, stats] = await Promise.all([
        db.getMatchById(matchId),
        sportsSync.getMatchEvents(matchId),
        sportsSync.getMatchStatistics(matchId),
      ]);

      res.json({
        success: true,
        data: {
          match: match || null,
          events: events || [],
          stats: stats || null,
        },
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Sports: Match Events
  app.get('/api/matches/:id/events', async (req, res) => {
    const matchId = req.params.id;
    try {
      const events = await sportsSync.getMatchEvents(matchId);
      res.json({ success: true, count: events.length, data: events });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Sports: Match Statistics
  app.get('/api/matches/:id/stats', async (req, res) => {
    const matchId = req.params.id;
    try {
      const stats = await sportsSync.getMatchStatistics(matchId);
      res.json({ success: true, data: stats });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: null });
    }
  });

  // Facebook Config: Get
  app.get('/api/facebook/config', async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
      });

      res.json({
        success: true,
        data: {
          ...fbConfig,
          autoPublishEnabled: false,
          publishingMode: 'roundup',
          roundupIntervalMinutes: fbConfig.roundupIntervalMinutes || 5,
          timezone: fbConfig.timezone || 'UTC',
          hasAccessToken: Boolean(config.fbPageAccessToken || fbConfig.pageAccessToken),
          hasDeepseekKey: Boolean(fbConfig.deepseekApiKey || process.env.DEEPSEEK_API_KEY),
          deepseekModel: fbConfig.deepseekModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          useDeepseekAi: fbConfig.useDeepseekAi ?? true,
        },
      });
    } catch (e: any) {
      res.json({
        success: true,
        data: {
          pageId: config.fbPageId,
          isConnected: false,
          autoPublishEnabled: false,
          publishingMode: 'roundup',
          roundupIntervalMinutes: 5,
          minPostSpacingSeconds: 30,
          timezone: 'UTC',
          publishGoals: true,
          publishYellowCards: true,
          publishRedCards: true,
          publishCorners: true,
          publishKickoff: true,
          publishHalfTime: true,
          publishFullTime: true,
          includeStatsInFullTime: true,
          targetLeagueIds: [],
          hasAccessToken: Boolean(config.fbPageAccessToken),
          hasDeepseekKey: Boolean(process.env.DEEPSEEK_API_KEY),
          deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          useDeepseekAi: true,
        },
      });
    }
  });

  // Facebook Config: Save / Connect
  app.post('/api/facebook/config', adminAuthMiddleware, async (req, res) => {
    const incoming = req.body as Partial<FacebookPageConfig>;
    
    // Save to settings
    const current = await db.getSettings<FacebookPageConfig>('fbConfig', {
      pageId: config.fbPageId,
      isConnected: false,
      autoPublishEnabled: false,
      publishingMode: 'roundup',
      roundupIntervalMinutes: 5,
      minPostSpacingSeconds: 30,
      timezone: 'UTC',
      publishGoals: true,
      publishYellowCards: true,
      publishRedCards: true,
      publishCorners: true,
      publishKickoff: true,
      publishHalfTime: true,
      publishFullTime: true,
      includeStatsInFullTime: true,
      targetLeagueIds: [],
      postTemplateGoal: '',
      postTemplateYellowCard: '',
      postTemplateRedCard: '',
      postTemplateCorner: '',
      postTemplateKickoff: '',
      postTemplateHalfTime: '',
      postTemplateFullTime: '',
    });

    let pageAccessTokenToUse = incoming.pageAccessToken || current.pageAccessToken;
    const pageIdToUse = incoming.pageId || current.pageId;

    if (pageIdToUse && pageAccessTokenToUse) {
      try {
        const verifyCheck = await fbClient.verifyPageAccess(pageIdToUse, pageAccessTokenToUse);
        if (verifyCheck.isValid && verifyCheck.pageAccessToken) {
          pageAccessTokenToUse = verifyCheck.pageAccessToken;
        }
      } catch {
        // Fall back to provided token if verification query errors
      }
    }

    const updated: FacebookPageConfig = {
      ...current,
      ...incoming,
      autoPublishEnabled: false,
      pageAccessToken: pageAccessTokenToUse,
      publishingMode: 'roundup',
      isConnected: Boolean(pageIdToUse && pageAccessTokenToUse),
    };

    if (pageAccessTokenToUse) {
      config.fbPageAccessToken = pageAccessTokenToUse;
    }
    if (pageIdToUse) {
      config.fbPageId = pageIdToUse;
    }

    await db.saveSettings('fbConfig', updated);

    res.json({
      success: true,
      message: 'Facebook page configuration updated successfully',
      data: updated,
    });
  });

  // Facebook: Verify Page Credentials with Meta Graph API
  app.post('/api/facebook/verify', async (req, res) => {
    const { pageId, accessToken } = req.body;
    const targetPageId = pageId || config.fbPageId;
    const targetToken = accessToken || config.fbPageAccessToken;

    if (!targetPageId || !targetToken) {
      return res.status(400).json({
        success: false,
        error: 'Both Page ID and Page Access Token are required for verification',
      });
    }

    const verification = await fbClient.verifyPageAccess(targetPageId, targetToken);

    // If verification succeeded and resolved a dedicated Page Access Token, save it
    if (verification.isValid && verification.pageAccessToken) {
      try {
        const curConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {} as any);
        if (curConfig) {
          curConfig.pageAccessToken = verification.pageAccessToken;
          curConfig.isConnected = true;
          await db.saveSettings('fbConfig', curConfig);
          config.fbPageAccessToken = verification.pageAccessToken;
        }
      } catch {
        // Ignore setting persistence error
      }
    }

    res.json({
      success: verification.isValid,
      data: verification,
    });
  });

  // Facebook: Clear Stuck Queue and Reset Anti-Spam Cooldown
  app.post('/api/facebook/clear-queue', adminAuthMiddleware, async (req, res) => {
    try {
      const clearedCount = await publisherQueue.clearQueue();
      res.json({
        success: true,
        clearedCount,
        message: `Successfully cleared ${clearedCount} post(s) and reset Facebook anti-spam cooldown.`,
        metrics: publisherQueue.getMetrics(),
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Direct Test Post Trigger
  app.post('/api/facebook/test-publish', adminAuthMiddleware, async (req, res) => {
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        pageAccessToken: config.fbPageAccessToken,
        isConnected: false,
        autoPublishEnabled: false,
        publishGoals: true,
        publishRedCards: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateRedCard: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
      });

      const targetPageId = req.body.pageId || config.fbPageId || fbConfig?.pageId;
      const targetToken = req.body.accessToken || config.fbPageAccessToken || fbConfig?.pageAccessToken;

      if (!targetPageId || !targetToken) {
        return res.status(400).json({
          success: false,
          error: 'Facebook Page ID and Page Access Token must be provided or saved first.',
        });
      }

      const testMessage = req.body.message || `⚽ Live Sports Scores Test Post\n\n✅ Meta Graph API connection verified!\n⏱️ Dispatched: ${new Date().toUTCString()}\n\n#LiveScores #Football #ScoreFlow`;

      // Route test publish through the centralized FacebookPublisher service
      // strictly respecting persistent rate limits, active cooldowns, and locks
      const result = await facebookPublisher.requestPublication({
        publicationType: 'TEST',
        matchId: 'test',
        matchTitle: 'Meta Connection Test',
        leagueName: 'Live Sports App',
        eventType: 'STATUS_CHANGE',
        message: testMessage,
        pageId: targetPageId,
        accessToken: targetToken,
        isTest: true,
      });

      if (result.success && result.status === 'PUBLISHED') {
        res.json({
          success: true,
          message: result.message || 'Test post successfully published to your Facebook Page!',
          fbPostId: result.fbPostId,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message || result.reason || 'Meta Graph API returned an error publishing the test post.',
          blocked: result.blocked,
          cooldownUntil: result.cooldownUntil,
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to send test post' });
    }
  });

  // Facebook: Post History
  app.get('/api/facebook/posts', async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    try {
      const posts = await db.getFacebookPosts(limit);
      res.json({ success: true, count: posts.length, data: posts });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message, data: [] });
    }
  });

  // Facebook: Clear History
  app.delete('/api/facebook/posts', async (req, res) => {
    try {
      await db.clearFacebookPosts();
      res.json({ success: true, message: 'Facebook post history cleared' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Reset / Acknowledge Anti-Spam / Rate-Limit Cooldown
  app.post('/api/facebook/reset-cooldown', async (req, res) => {
    try {
      const outcome = await facebookPublisher.acknowledgeOrResume();
      res.json({
        success: outcome.success,
        cooldownStillActive: outcome.cooldownStillActive,
        cooldownRemainingSeconds: outcome.cooldownRemainingSeconds,
        message: outcome.message,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to acknowledge status' });
    }
  });

  // Facebook: Get Queue Metrics & Real-time Persistent Status Overview
  app.get('/api/facebook/queue-status', async (req, res) => {
    try {
      const overview = await facebookPublisher.getStatusOverview();
      res.json({ success: true, queue: publisherQueue.getMetrics(), overview });
    } catch (e: any) {
      res.json({ success: true, queue: publisherQueue.getMetrics() });
    }
  });

  // DeepSeek AI: Test Connection
  app.post('/api/facebook/deepseek/test', adminAuthMiddleware, async (req, res) => {
    try {
      const { apiKey, model } = req.body || {};
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
      } as any);

      const keyToTest = apiKey || fbConfig.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
      const modelToTest = model || fbConfig.deepseekModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

      const result = await DeepseekGenerator.testConnection(keyToTest, modelToTest);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || 'Error testing DeepSeek API connection' });
    }
  });

  // DeepSeek AI: On-Demand Headline & Copy Generation across Live, Half-Time, and Full-Time
  app.post('/api/facebook/deepseek/generate', adminAuthMiddleware, async (req, res) => {
    try {
      const postType = (req.body?.postType || 'LIVE') as 'LIVE' | 'HT' | 'FT';
      const offset = Number(req.body?.offset || 0);

      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
      } as any);

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      let targetMatches: Match[] = [];

      if (postType === 'LIVE') {
        const live = await sportsSync.getLiveMatches();
        const enriched = await sportsSync.enrichMatchesWithStats(live);
        targetMatches = enriched.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));
      } else if (postType === 'HT') {
        const live = await sportsSync.getLiveMatches();
        const enriched = await sportsSync.enrichMatchesWithStats(live);
        targetMatches = enriched.filter(m => isMatchAtHalfTime(m) && dailySelection.selectedLeagueIds.includes(m.league?.id));
      } else {
        const results = await sportsSync.getResults(offset);
        const enriched = await sportsSync.enrichMatchesWithStats(results.slice(0, 20));
        targetMatches = enriched.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));
      }

      if (targetMatches.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No matches found for ${postType} in your selected leagues for today (${dailySelection.date}).`,
        });
      }

      const aiCopy = await DeepseekGenerator.generateCopy(targetMatches, postType, fbConfig);

      let previewText = '';
      if (postType === 'LIVE') {
        previewText = formatLiveRoundupPost(targetMatches, fbConfig, aiCopy);
      } else if (postType === 'HT') {
        previewText = formatHalfTimeRoundupPost(targetMatches, fbConfig, aiCopy);
      } else {
        previewText = formatResultsRoundupPost(targetMatches, fbConfig, aiCopy);
      }

      res.json({
        success: true,
        postType,
        matchCount: targetMatches.length,
        aiCopy,
        previewText,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to generate DeepSeek AI copy' });
    }
  });

  // Facebook: Preview Live Roundup Post (All live games in a single post)
  app.get('/api/facebook/preview-roundup', async (req, res) => {
    try {
      let matches = await sportsSync.getLiveMatches();
      matches = await sportsSync.enrichMatchesWithStats(matches);
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
        postTemplateRoundup: '',
      });

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      // Filter strictly by target leagues selected for today
      let targetMatches: Match[] = [];
      if (dailySelection.selectedLeagueIds && dailySelection.selectedLeagueIds.length > 0) {
        targetMatches = matches.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));
      }

      let aiCopy: AiGeneratedCopy | undefined;
      const shouldUseAi = req.query.ai === 'true' || (fbConfig.useDeepseekAi && Boolean(DeepseekGenerator.getApiKey(fbConfig)));
      if (shouldUseAi && targetMatches.length > 0) {
        aiCopy = await DeepseekGenerator.generateCopy(targetMatches, 'LIVE', fbConfig);
      }

      const previewText = targetMatches.length > 0
        ? formatLiveRoundupPost(targetMatches, fbConfig, aiCopy)
        : `⚠️ No leagues are selected for today (${dailySelection.date}).\nPlease select one or more leagues in the League Selection panel to preview or publish games.`;
      res.json({
        success: true,
        matchCount: targetMatches.length,
        totalLiveCount: matches.length,
        matches: targetMatches,
        previewText,
        aiCopy,
        publishingMode: 'roundup',
        roundupIntervalMinutes: fbConfig.roundupIntervalMinutes || 5,
        minPostSpacingSeconds: fbConfig.minPostSpacingSeconds || 30,
        timezone: fbConfig.timezone || 'UTC',
        lastRoundupPublishedAt: fbConfig.lastRoundupPublishedAt,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to generate roundup preview' });
    }
  });

  // Facebook: Publish Live Roundup Post Now (All live games in a single post)
  app.post('/api/facebook/publish-roundup', adminAuthMiddleware, async (req, res) => {
    try {
      let matches = await sportsSync.getLiveMatches();
      matches = await sportsSync.enrichMatchesWithStats(matches);
      if (!matches || matches.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No active live matches found at this moment to include in a roundup post.',
        });
      }

      matches = await sportsSync.enrichMatchesWithStats(matches);

      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
        postTemplateRoundup: '',
      });

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
      if (!dailySelection.selectedLeagueIds || dailySelection.selectedLeagueIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No leagues are selected for today (${dailySelection.date}). Please select one or more leagues in the League Selection panel before publishing.`,
        });
      }

      const targetMatches = matches.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));
      if (targetMatches.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No live matches found matching your ${dailySelection.selectedLeagueIds.length} selected league(s) for today.`,
        });
      }

      const message = req.body?.customMessage || formatLiveRoundupPost(targetMatches, fbConfig);

      const postId = await publisherQueue.enqueue({
        matchId: `roundup_${Date.now()}`,
        matchTitle: `Live Scoreboard Roundup (${targetMatches.length} Matches)`,
        leagueName: 'Multiple Leagues',
        eventType: 'STATUS_CHANGE',
        message,
      });

      fbConfig.lastRoundupPublishedAt = new Date().toISOString();
      await db.saveSettings('fbConfig', fbConfig);

      res.json({
        success: true,
        postId,
        message: `Successfully enqueued live roundup post containing all ${matches.length} current live game(s)!`,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to enqueue roundup post' });
    }
  });

  // Facebook: Preview Full-Time Results Roundup
  app.get('/api/facebook/preview-results-roundup', async (req, res) => {
    try {
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
      const filterPublished = req.query.filterPublished !== 'false'; // default true
      let matches = await sportsSync.getResults(offset);
      
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
        postTemplateRoundup: '',
        postTemplateFullTimeRoundup: '',
      });

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      // Filter strictly by target leagues selected for today
      if (dailySelection.selectedLeagueIds && dailySelection.selectedLeagueIds.length > 0) {
        matches = matches.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));
      } else {
        matches = [];
      }

      const newMatches: Match[] = [];
      const alreadyPublishedMatches: Match[] = [];

      for (const m of matches) {
        const isPub = await db.isFtMatchPublished(m.id, m.homeTeam?.name, m.awayTeam?.name);
        if (isPub) {
          alreadyPublishedMatches.push(m);
        } else {
          newMatches.push(m);
        }
      }

      const matchesToPreview = filterPublished ? newMatches : matches;
      await sportsSync.enrichMatchesWithStats(matchesToPreview.slice(0, 20));

      let aiCopy: AiGeneratedCopy | undefined;
      const shouldUseAi = req.query.ai === 'true' || (fbConfig.useDeepseekAi && Boolean(DeepseekGenerator.getApiKey(fbConfig)));
      if (shouldUseAi && matchesToPreview.length > 0) {
        aiCopy = await DeepseekGenerator.generateCopy(matchesToPreview, 'FT', fbConfig);
      }

      const previewText = formatResultsRoundupPost(matchesToPreview, fbConfig, aiCopy);

      res.json({
        success: true,
        totalCompleted: matches.length,
        matchCount: matchesToPreview.length,
        newMatchCount: newMatches.length,
        alreadyPublishedCount: alreadyPublishedMatches.length,
        offset,
        matches: matchesToPreview.slice(0, 50),
        previewText,
        aiCopy,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to preview results roundup' });
    }
  });

  // Facebook: Publish Full-Time Results Roundup Now
  app.post('/api/facebook/publish-results-roundup', adminAuthMiddleware, async (req, res) => {
    try {
      const offset = req.body?.offset !== undefined ? Number(req.body.offset) : 0;
      const forceIncludeAll = req.body?.forceIncludeAll === true;
      let matches = await sportsSync.getResults(offset);
      if (!matches || matches.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No completed match results found for this date to include in a results post.',
        });
      }

      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
        postTemplateRoundup: '',
        postTemplateFullTimeRoundup: '',
      });

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
      if (!dailySelection.selectedLeagueIds || dailySelection.selectedLeagueIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No leagues are selected for today (${dailySelection.date}). Please select one or more leagues in the League Selection panel before publishing results.`,
        });
      }

      matches = matches.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));

      // Check which matches were already published
      const newMatches: Match[] = [];
      const alreadyPublishedMatches: Match[] = [];

      for (const m of matches) {
        const isPub = await db.isFtMatchPublished(m.id, m.homeTeam?.name, m.awayTeam?.name);
        if (isPub) {
          alreadyPublishedMatches.push(m);
        } else {
          newMatches.push(m);
        }
      }

      const matchesToPost = forceIncludeAll ? matches : newMatches;

      if (matchesToPost.length === 0) {
        return res.status(400).json({
          success: false,
          error: `All ${matches.length} completed match(es) for these teams have already been published. No new Full-Time results to post.`,
          alreadyPublishedCount: alreadyPublishedMatches.length,
        });
      }

      await sportsSync.enrichMatchesWithStats(matchesToPost.slice(0, 20));
      const message = req.body?.customMessage || formatResultsRoundupPost(matchesToPost, fbConfig);

      const postId = await publisherQueue.enqueue({
        matchId: `results_roundup_${Date.now()}`,
        matchTitle: `Full-Time Results (${matchesToPost.length} Matches)`,
        leagueName: 'Multiple Leagues',
        eventType: 'FULL_TIME',
        message,
      });

      // Mark posted matches as published so they will NEVER be repeated in subsequent FT posts
      await db.markFtMatchesPublished(matchesToPost);

      fbConfig.lastFtRoundupPublishedAt = new Date().toISOString();
      await db.saveSettings('fbConfig', fbConfig);

      res.json({
        success: true,
        postId,
        publishedCount: matchesToPost.length,
        alreadyPublishedSkipped: alreadyPublishedMatches.length,
        message: `Successfully enqueued grouped Full-Time results containing ${matchesToPost.length} match(es)! (${alreadyPublishedMatches.length} previously published match(es) omitted to avoid duplicates)`,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to enqueue results roundup' });
    }
  });

  // Facebook: Get List of Published Full-Time Matches
  app.get('/api/facebook/published-ft-matches', async (req, res) => {
    try {
      const records = await db.getPublishedFtMatches();
      res.json({
        success: true,
        count: records.length,
        records: records.slice(0, 100),
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Clear Published Full-Time History (Allow Re-posting)
  app.post('/api/facebook/clear-published-ft-matches', adminAuthMiddleware, async (req, res) => {
    try {
      await db.clearPublishedFtMatches();
      res.json({
        success: true,
        message: 'Successfully cleared Full-Time publishing history. All matches are now eligible for posting.',
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Mark Current Completed Matches as Published (Skip without posting)
  app.post('/api/facebook/mark-current-results-as-published', adminAuthMiddleware, async (req, res) => {
    try {
      const offset = req.body?.offset !== undefined ? Number(req.body.offset) : 0;
      const matches = await sportsSync.getResults(offset);
      await db.markFtMatchesPublished(matches);
      res.json({
        success: true,
        count: matches.length,
        message: `Successfully marked ${matches.length} finished match(es) as already published. Future posts will only include newly finished games.`,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Preview Half-Time Roundup
  app.get('/api/facebook/preview-halftime-roundup', async (req, res) => {
    try {
      const filterPublished = req.query.filterPublished !== 'false';
      const liveMatches = await sportsSync.getLiveMatches();
      let htMatches = liveMatches.filter(m => isMatchAtHalfTime(m));

      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupFormat: 'default',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
        postTemplateRoundup: '',
        postTemplateFullTimeRoundup: '',
        postTemplateHalfTimeRoundup: '',
      });

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      // Filter strictly by target leagues selected for today
      if (dailySelection.selectedLeagueIds && dailySelection.selectedLeagueIds.length > 0) {
        htMatches = htMatches.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));
      } else {
        htMatches = [];
      }

      const newMatches: Match[] = [];
      const alreadyPublishedMatches: Match[] = [];

      for (const m of htMatches) {
        const isPub = await db.isHtMatchPublished(m.id, m.homeTeam?.name, m.awayTeam?.name);
        if (isPub) {
          alreadyPublishedMatches.push(m);
        } else {
          newMatches.push(m);
        }
      }

      const matchesToPreview = filterPublished ? newMatches : htMatches;
      await sportsSync.enrichMatchesWithStats(matchesToPreview.slice(0, 20));

      let aiCopy: AiGeneratedCopy | undefined;
      const shouldUseAi = req.query.ai === 'true' || (fbConfig.useDeepseekAi && Boolean(DeepseekGenerator.getApiKey(fbConfig)));
      if (shouldUseAi && matchesToPreview.length > 0) {
        aiCopy = await DeepseekGenerator.generateCopy(matchesToPreview, 'HT', fbConfig);
      }

      const previewText = formatHalfTimeRoundupPost(matchesToPreview, fbConfig, aiCopy);

      res.json({
        success: true,
        totalHalfTime: htMatches.length,
        matchCount: matchesToPreview.length,
        newMatchCount: newMatches.length,
        alreadyPublishedCount: alreadyPublishedMatches.length,
        matches: matchesToPreview.slice(0, 50),
        previewText,
        aiCopy,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to preview half-time roundup' });
    }
  });

  // Facebook: Publish Half-Time Roundup Now
  app.post('/api/facebook/publish-halftime-roundup', adminAuthMiddleware, async (req, res) => {
    try {
      const forceIncludeAll = req.body?.forceIncludeAll === true;
      const liveMatches = await sportsSync.getLiveMatches();
      let htMatches = liveMatches.filter(m => isMatchAtHalfTime(m));

      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishingMode: 'roundup',
        roundupFormat: 'default',
        roundupIntervalMinutes: 5,
        minPostSpacingSeconds: 30,
        timezone: 'UTC',
        publishGoals: true,
        publishYellowCards: true,
        publishRedCards: true,
        publishCorners: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateYellowCard: '',
        postTemplateRedCard: '',
        postTemplateCorner: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
        postTemplateRoundup: '',
        postTemplateFullTimeRoundup: '',
        postTemplateHalfTimeRoundup: '',
      });

      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
      if (!dailySelection.selectedLeagueIds || dailySelection.selectedLeagueIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No leagues are selected for today (${dailySelection.date}). Please select one or more leagues in the League Selection panel before publishing half-time scores.`,
        });
      }

      htMatches = htMatches.filter(m => dailySelection.selectedLeagueIds.includes(m.league?.id));

      if (htMatches.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No matches currently at half-time in your selected leagues to post.',
        });
      }

      // Check which matches were already published
      const newMatches: Match[] = [];
      const alreadyPublishedMatches: Match[] = [];

      for (const m of htMatches) {
        const isPub = await db.isHtMatchPublished(m.id, m.homeTeam?.name, m.awayTeam?.name);
        if (isPub) {
          alreadyPublishedMatches.push(m);
        } else {
          newMatches.push(m);
        }
      }

      const matchesToPost = forceIncludeAll ? htMatches : newMatches;

      if (matchesToPost.length === 0) {
        return res.status(400).json({
          success: false,
          error: `All ${htMatches.length} match(es) at half-time have already been published. No new half-time scores to post.`,
          alreadyPublishedCount: alreadyPublishedMatches.length,
        });
      }

      await sportsSync.enrichMatchesWithStats(matchesToPost.slice(0, 20));
      const message = req.body?.customMessage || formatHalfTimeRoundupPost(matchesToPost, fbConfig);

      const postId = await publisherQueue.enqueue({
        matchId: `halftime_roundup_${Date.now()}`,
        matchTitle: `Half-Time Scores (${matchesToPost.length} Matches)`,
        leagueName: 'Multiple Leagues',
        eventType: 'STATUS_CHANGE',
        message,
      });

      // Mark posted matches as published at HT so they will not be repeated in subsequent HT posts
      await db.markHtMatchesPublished(matchesToPost);

      fbConfig.lastHtRoundupPublishedAt = new Date().toISOString();
      await db.saveSettings('fbConfig', fbConfig);

      res.json({
        success: true,
        postId,
        publishedCount: matchesToPost.length,
        alreadyPublishedSkipped: alreadyPublishedMatches.length,
        message: `Successfully enqueued grouped Half-Time scores containing ${matchesToPost.length} match(es)! (${alreadyPublishedMatches.length} previously published match(es) omitted to avoid duplicates)`,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to enqueue half-time scores post' });
    }
  });

  // Facebook: Get List of Published Half-Time Matches
  app.get('/api/facebook/published-ht-matches', async (req, res) => {
    try {
      const records = await db.getPublishedHtMatches();
      res.json({
        success: true,
        count: records.length,
        records: records.slice(0, 100),
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Clear Published Half-Time History (Allow Re-posting)
  app.post('/api/facebook/clear-published-ht-matches', adminAuthMiddleware, async (req, res) => {
    try {
      await db.clearPublishedHtMatches();
      res.json({
        success: true,
        message: 'Successfully cleared Half-Time publishing history. All matches are now eligible for half-time posting.',
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Clear pending queue to avoid spam repetition
  app.post('/api/facebook/clear-queue', async (req, res) => {
    try {
      const clearedCount = await publisherQueue.clearQueue();
      res.json({
        success: true,
        clearedCount,
        message: `Successfully cleared ${clearedCount} pending item(s) from Facebook publisher queue.`,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Failed to clear queue' });
    }
  });

  // Facebook: Retry single skipped/failed post
  app.post('/api/facebook/retry-post/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const posts = await db.getFacebookPosts(100);
      const target = posts.find(p => p.id === req.params.id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'Post not found' });
      }

      // Check if cooldown is active before allowing retry
      const state = await db.getFacebookPublisherState();
      const now = Date.now();
      if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > now) {
        const remainingSec = Math.ceil((new Date(state.cooldownUntil).getTime() - now) / 1000);
        return res.status(400).json({
          success: false,
          error: `Cannot retry now: Meta Anti-Spam Cooldown active (${remainingSec}s remaining). Retrying during cooldown extends the block.`,
          retryAfterSeconds: remainingSec,
        });
      }

      // Reset record in database
      await db.updateFacebookPost(target.id, {
        status: 'QUEUED',
        retryCount: 0,
        error: undefined,
      });

      const pubRes = await facebookPublisher.requestPublication({
        publicationType: 'MANUAL',
        matchId: target.matchId,
        matchTitle: target.matchTitle,
        leagueName: target.leagueName,
        eventType: target.eventType,
        message: target.message,
      });

      res.json({ success: pubRes.success, message: pubRes.message });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Retry all skipped/failed posts
  app.post('/api/facebook/retry-all-skipped', adminAuthMiddleware, async (req, res) => {
    try {
      const state = await db.getFacebookPublisherState();
      const now = Date.now();
      if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > now) {
        const remainingSec = Math.ceil((new Date(state.cooldownUntil).getTime() - now) / 1000);
        return res.status(400).json({
          success: false,
          error: `Cannot retry all: Meta Anti-Spam Cooldown active (${remainingSec}s remaining).`,
          retryAfterSeconds: remainingSec,
        });
      }

      const posts = await db.getFacebookPosts(100);
      const toRetry = posts.filter(p => p.status === 'SKIPPED' || p.status === 'FAILED');

      let queuedCount = 0;
      for (const p of toRetry) {
        await db.updateFacebookPost(p.id, {
          status: 'QUEUED',
          retryCount: 0,
          error: undefined,
        });

        await facebookPublisher.requestPublication({
          publicationType: 'MANUAL',
          matchId: p.matchId,
          matchTitle: p.matchTitle,
          leagueName: p.leagueName,
          eventType: p.eventType,
          message: p.message,
        });
        queuedCount++;
      }

      res.json({ success: true, count: queuedCount, message: `Re-enqueued ${queuedCount} posts for paced publishing` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Facebook: Manual Post Trigger
  app.post('/api/facebook/publish-manual', adminAuthMiddleware, async (req, res) => {
    const { matchId, matchTitle, leagueName, eventType, message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');

      // Verify league selection if a specific match is targeted
      if (matchId && matchId !== 'manual') {
        const match = await db.getMatchById(matchId);
        if (match?.league?.id) {
          if (!dailySelection.selectedLeagueIds || !dailySelection.selectedLeagueIds.includes(match.league.id)) {
            return res.status(400).json({
              success: false,
              error: `League "${match.league.name}" is not selected for today (${dailySelection.date}). Games from unselected leagues cannot be posted.`,
            });
          }
        }
      }

      const postId = await publisherQueue.enqueue({
        matchId: matchId || 'manual',
        matchTitle: matchTitle || 'Live Sports Update',
        leagueName: leagueName || 'Football',
        eventType: eventType || 'STATUS_CHANGE',
        message,
      });

      res.json({
        success: true,
        message: 'Post successfully enqueued for asynchronous publishing',
        postId,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // -------------------------------------------------------------
  // Health check (used by Render and load balancers)
  // -------------------------------------------------------------
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      ok: true,
      service: 'gamescores',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------
  // Vite Integration
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // GameScores uses its own WebSocket endpoint at /ws.
        // Disable Vite HMR to avoid a second WebSocket connection.
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[Server] Live Sports Scores & Facebook Publisher running on http://0.0.0.0:${config.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received. Shutting down gracefully...`);
    try {
      sportsSync.stop();
      scraplingSupervisor.stop();
      publisherQueue.stopWorker();
    } catch (err) {
      console.warn('[Server] Shutdown cleanup warning:', (err as Error)?.message || err);
    }

    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
