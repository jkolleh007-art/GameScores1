import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  scraplingUrl: process.env.SCRAPLING_SERVICE_URL || 'http://127.0.0.1:5001',
  scraplingPort: 5001,
  
  // Facebook Meta Graph API
  fbApiVersion: process.env.FB_API_VERSION || 'v22.0',
  fbPageId: process.env.FB_PAGE_ID || '',
  fbPageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
  
  // Database & Cache
  databaseUrl: process.env.DATABASE_URL || 'postgresql://gamescores_8n73_user:yytt6F2BRAftBE5oEbJebNPIcyC7GAPF@dpg-danrl90ae00c739qtqag-a/gamescores_8n73',
  redisUrl: process.env.REDIS_URL || '',
  
  // Security & Admin Auth
  apiAdminKey: process.env.API_ADMIN_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'gamescores_admin_jwt_secret_token_key_2026',
  
  // Polling & Queue intervals
  scrapeIntervalSeconds: Math.max(15, Number(process.env.SCRAPE_INTERVAL_SECONDS) || 30),
  fbPublishMaxRetries: 3,
  fbRateLimitPerMinute: 10,
};
