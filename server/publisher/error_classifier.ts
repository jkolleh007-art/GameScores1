import crypto from 'crypto';

export type FacebookErrorClassificationType =
  | 'META_SPAM_VELOCITY_BLOCK' // 1390008, 368 action block
  | 'RATE_LIMIT_STANDARD'      // 4, 17, 32, 613
  | 'AUTH_PERMISSION_ERROR'    // 190, 200, OAuthException
  | 'PAGE_NOT_FOUND_OR_INVALID'
  | 'TEMPORARY_NETWORK_FAILURE'
  | 'GENERIC_API_ERROR';

export interface ClassifiedFacebookError {
  type: FacebookErrorClassificationType;
  code?: number;
  subcode?: number;
  isSpamVelocityBlock: boolean;
  isRateLimit: boolean;
  isAuthOrPermissionError: boolean;
  shouldPausePublishing: boolean;
  message: string;
  recommendedCooldownSeconds: number;
}

/**
 * Deterministic error classifier for Meta Graph API responses.
 * Specifically classifies 1390008 (Anti-Spam Velocity Block) and permission/network failures.
 */
export function classifyFacebookError(error: any): ClassifiedFacebookError {
  const code = error?.errorCode ?? error?.code;
  const subcode = error?.errorSubcode ?? error?.subcode ?? error?.error_subcode ?? error?.error_data?.error_subcode;
  const rawMessage = String(error?.message || error?.error || '');
  const msgLower = rawMessage.toLowerCase();

  // 1. Meta Anti-Spam Velocity Limiter (1390008) or Action Block (368)
  const isSpamVelocityBlock =
    subcode === 1390008 ||
    code === 368 ||
    msgLower.includes('limit how often') ||
    msgLower.includes('protect the community from spam') ||
    msgLower.includes('temporarily blocked') ||
    msgLower.includes('velocity');

  if (isSpamVelocityBlock) {
    return {
      type: 'META_SPAM_VELOCITY_BLOCK',
      code,
      subcode: subcode || 1390008,
      isSpamVelocityBlock: true,
      isRateLimit: true,
      isAuthOrPermissionError: false,
      shouldPausePublishing: true,
      message: 'Meta Anti-Spam Velocity Block (Error 1390008): Facebook temporarily blocked publishing to protect against spam velocity.',
      recommendedCooldownSeconds: 600, // 10 minutes initial base
    };
  }

  // 2. Standard Meta Graph API Rate Limit (4, 17, 32, 613)
  const isRateLimit =
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    msgLower.includes('calls to this api have exceeded') ||
    msgLower.includes('rate limit');

  if (isRateLimit) {
    return {
      type: 'RATE_LIMIT_STANDARD',
      code,
      subcode,
      isSpamVelocityBlock: false,
      isRateLimit: true,
      isAuthOrPermissionError: false,
      shouldPausePublishing: true,
      message: rawMessage || 'Meta Graph API call rate limit exceeded.',
      recommendedCooldownSeconds: 300, // 5 minutes
    };
  }

  // 3. Authentication, Token Expiration or Permission Errors (190, 200, 10)
  const isAuthOrPermissionError =
    code === 190 ||
    code === 10 ||
    code === 200 ||
    msgLower.includes('token') ||
    msgLower.includes('permission') ||
    msgLower.includes('oauthexception') ||
    msgLower.includes('session has expired') ||
    msgLower.includes('user must be an administrator');

  if (isAuthOrPermissionError) {
    return {
      type: 'AUTH_PERMISSION_ERROR',
      code,
      subcode,
      isSpamVelocityBlock: false,
      isRateLimit: false,
      isAuthOrPermissionError: true,
      shouldPausePublishing: true,
      message: rawMessage || 'Facebook Page authentication or permissions invalid.',
      recommendedCooldownSeconds: 3600, // 1 hour pause until credentials updated
    };
  }

  // 4. Temporary Network Failure
  const isNetworkFailure =
    msgLower.includes('network') ||
    msgLower.includes('econnrefused') ||
    msgLower.includes('etimedout') ||
    msgLower.includes('fetch failed') ||
    msgLower.includes('ehostunreach');

  if (isNetworkFailure) {
    return {
      type: 'TEMPORARY_NETWORK_FAILURE',
      code,
      subcode,
      isSpamVelocityBlock: false,
      isRateLimit: false,
      isAuthOrPermissionError: false,
      shouldPausePublishing: false,
      message: rawMessage || 'Network connectivity error connecting to Meta Graph API.',
      recommendedCooldownSeconds: 60, // 1 minute
    };
  }

  return {
    type: 'GENERIC_API_ERROR',
    code,
    subcode,
    isSpamVelocityBlock: false,
    isRateLimit: false,
    isAuthOrPermissionError: false,
    shouldPausePublishing: false,
    message: rawMessage || 'Unknown Meta Graph API error.',
    recommendedCooldownSeconds: 60,
  };
}

/**
 * Normalizes Facebook message content and computes deterministic SHA-256 hash.
 * Irrelevant timestamps, whitespace differences, and random trailing tokens are normalized.
 */
export function computeContentHash(rawMessage: string): string {
  if (!rawMessage) return '';
  // Normalize whitespace and newlines
  const normalized = rawMessage
    .replace(/\r\n/g, '\n')
    // Strip dynamic dispatch timestamps e.g. "⏱️ Dispatched: ..." or "Updated at: ..."
    .replace(/(?:⏱️\s*)?(?:Dispatched|Updated|Time|Generated|Sent):\s*[^\n]+/gi, '')
    // Normalize repeated whitespace
    .replace(/[ \t]+/g, ' ')
    .trim();

  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}
