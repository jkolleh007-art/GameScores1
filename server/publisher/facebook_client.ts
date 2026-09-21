import { config } from '../config.js';

export interface MetaPageDetails {
  id: string;
  name: string;
  category?: string;
  link?: string;
  verificationStatus?: string;
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
  errorCode?: number;
  errorSubcode?: number;
  rateLimited?: boolean;
  isSpamBlocked?: boolean;
  cooldownSeconds?: number;
}

export class FacebookGraphClient {
  private apiVersion: string;

  constructor(apiVersion = config.fbApiVersion) {
    this.apiVersion = apiVersion;
  }

  get baseUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Verify Facebook Page Access Token and retrieve page details from Meta Graph API
   */
  async verifyPageCredentials(pageId: string, accessToken: string): Promise<{
    valid: boolean;
    page?: MetaPageDetails;
    permissions?: string[];
    pageAccessToken?: string;
    error?: string;
  }> {
    if (!pageId || !accessToken) {
      return { valid: false, error: 'Page ID and Page Access Token are required.' };
    }

    try {
      // 1. Check page info and attempt to resolve dedicated Page Access Token
      const pageUrl = `${this.baseUrl}/${encodeURIComponent(pageId)}?fields=id,name,category,link,verification_status,access_token&access_token=${encodeURIComponent(accessToken)}`;
      const pageRes = await fetch(pageUrl);
      const pageData = await pageRes.json();

      if (!pageRes.ok || pageData.error) {
        const errMsg = pageData.error?.message || `Meta API error (${pageRes.status})`;
        return {
          valid: false,
          error: `${errMsg} [Code ${pageData.error?.code || pageRes.status}]`,
        };
      }

      // If Meta returned a dedicated Page Access Token for this page, capture it
      const resolvedPageToken = pageData.access_token || undefined;

      // 2. Check token permissions
      let grantedPermissions: string[] = [];
      try {
        const permUrl = `${this.baseUrl}/me/permissions?access_token=${encodeURIComponent(accessToken)}`;
        const permRes = await fetch(permUrl);
        const permData = await permRes.json();
        if (permData?.data && Array.isArray(permData.data)) {
          grantedPermissions = permData.data
            .filter((p: any) => p.status === 'granted')
            .map((p: any) => p.permission);
        }
      } catch {
        // Permissions check might fail on restricted page tokens; page query succeeded
      }

      return {
        valid: true,
        page: {
          id: pageData.id,
          name: pageData.name,
          category: pageData.category,
          link: pageData.link,
          verificationStatus: pageData.verification_status,
        },
        permissions: grantedPermissions,
        pageAccessToken: resolvedPageToken,
      };
    } catch (err) {
      return {
        valid: false,
        error: `Network failure connecting to Meta Graph API: ${(err as Error).message}`,
      };
    }
  }

  async verifyPageAccess(pageId: string, accessToken: string) {
    const res = await this.verifyPageCredentials(pageId, accessToken);
    return {
      isValid: res.valid,
      page: res.page,
      permissions: res.permissions,
      pageAccessToken: res.pageAccessToken,
      error: res.error,
    };
  }

  /**
   * Publish a post to the connected Facebook Page using official POST /{page-id}/feed endpoint
   */
  async publishPost(pageId: string, accessToken: string, message: string, link?: string): Promise<PublishResult> {
    if (!pageId || !accessToken) {
      return {
        success: false,
        error: 'Missing Page ID or Page Access Token.',
      };
    }

    try {
      const endpoint = `${this.baseUrl}/${encodeURIComponent(pageId)}/feed`;
      const body = new URLSearchParams();
      body.append('message', message);
      body.append('published', 'true');
      body.append('access_token', accessToken);
      if (link) {
        body.append('link', link);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      // Parse usage headers
      const pageUsage = response.headers.get('x-page-usage');
      const appUsage = response.headers.get('x-app-usage');
      if (pageUsage || appUsage) {
        console.log(`[FB Graph API Usage] Page: ${pageUsage || 'N/A'}, App: ${appUsage || 'N/A'}`);
      }

      const data = await response.json();

      if (!response.ok || data.error) {
        const err = data.error || {};
        const code = err.code;
        const subcode = err.error_subcode || err.error_data?.error_subcode;
        const msg = String(err.message || '');

        // Detect Meta spam velocity limits and action blocking
        const isSpamBlocked =
          subcode === 1390008 ||
          code === 368 ||
          msg.includes('limit how often') ||
          msg.includes('protect the community from spam') ||
          msg.includes('temporarily blocked');

        // Detect API quota and request rate limits
        const isRateLimit =
          isSpamBlocked ||
          code === 4 ||
          code === 17 ||
          code === 32 ||
          code === 613 ||
          msg.toLowerCase().includes('rate limit') ||
          msg.toLowerCase().includes('calls to this api have exceeded');

        let cooldownSeconds = 0;
        if (isSpamBlocked) {
          // Meta anti-spam velocity limiter (1390008) requires 5+ minutes of complete rest to clear
          cooldownSeconds = 300;
        } else if (isRateLimit) {
          cooldownSeconds = 60;
        }

        console.warn('[FB Graph API Throttled]', {
          code,
          subcode,
          type: err.type,
          isSpamBlocked,
          isRateLimit,
          cooldownSeconds,
          message: msg,
        });

        return {
          success: false,
          error: msg || `Meta Graph API error ${response.status}`,
          errorCode: code,
          errorSubcode: subcode,
          rateLimited: isRateLimit,
          isSpamBlocked,
          cooldownSeconds,
        };
      }

      return {
        success: true,
        postId: data.id,
      };
    } catch (err) {
      console.warn('[FB Graph Client] Network error publishing post:', (err as Error).message);
      return {
        success: false,
        error: `Network error connecting to Meta Graph API: ${(err as Error).message}`,
      };
    }
  }
}

export const fbClient = new FacebookGraphClient();
