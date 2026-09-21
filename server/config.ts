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
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  
  // Security
  apiAdminKey: process.env.API_ADMIN_KEY || '',
  
  // Polling & Queue intervals
  scrapeIntervalSeconds: Math.max(15, Number(process.env.SCRAPE_INTERVAL_SECONDS) || 30),
  fbPublishMaxRetries: 3,
  fbRateLimitPerMinute: 10,
};
