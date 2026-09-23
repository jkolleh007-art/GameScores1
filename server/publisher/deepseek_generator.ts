import { Match, FacebookPageConfig } from '../types';
import {
  LIVE_HEADLINES,
  LIVE_SUBHEADS,
  LIVE_CLOSINGS,
  HT_HEADLINES,
  HT_SUBHEADS,
  HT_CLOSINGS,
  FT_HEADLINES,
  FT_SUBHEADS,
  FT_CLOSINGS,
  generateSmartDynamicHashtags,
} from './templates';

export interface AiGeneratedCopy {
  headline: string;
  subhead: string;
  closing: string;
  hashtags: string;
  isAiGenerated: boolean;
  modelUsed?: string;
  latencyMs?: number;
}

/**
 * DeepSeek AI Copy Generation Engine
 * Uses deepseek-chat (DeepSeek-V3) via OpenAI-compatible endpoint.
 * Generates natural, human-like sports journalist headlines and copy
 * across LIVE, HALF-TIME, and FULL-TIME match posts.
 */
export class DeepseekGenerator {
  private static readonly API_URL = 'https://api.deepseek.com/chat/completions';

  /**
   * Resolve active DeepSeek API Key (from DB config or process.env)
   */
  public static getApiKey(config?: FacebookPageConfig): string | undefined {
    return config?.deepseekApiKey?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || undefined;
  }

  /**
   * Resolve active DeepSeek Model
   */
  public static getModel(config?: FacebookPageConfig): string {
    return config?.deepseekModel?.trim() || process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
  }

  /**
   * Test DeepSeek API connection and token validity
   */
  public static async testConnection(apiKeyOverride?: string, modelOverride?: string): Promise<{
    success: boolean;
    message: string;
    latencyMs?: number;
    model?: string;
  }> {
    const apiKey = apiKeyOverride?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      return {
        success: false,
        message: 'No DeepSeek API key provided. Set DEEPSEEK_API_KEY in environment or configure it in Facebook settings.',
      };
    }

    const model = modelOverride?.trim() || process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a football sports journalist. Respond only with JSON: {"status": "ok", "message": "DeepSeek Connected"}',
            },
            {
              role: 'user',
              content: 'Ping test',
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 50,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          message: `DeepSeek API returned HTTP ${res.status}: ${errorText.slice(0, 180)}`,
          latencyMs,
        };
      }

      return {
        success: true,
        message: `Successfully connected to DeepSeek AI (${model}) in ${latencyMs}ms!`,
        latencyMs,
        model,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.name === 'AbortError' ? 'DeepSeek connection timed out after 8s.' : e.message || 'Unknown network error',
      };
    }
  }

  /**
   * Generates natural AI headline, subhead, closing, and smart hashtags
   * with guaranteed graceful fallback to the anti-spam rotation engine.
   */
  public static async generateCopy(
    matches: Match[],
    postType: 'LIVE' | 'HT' | 'FT',
    config: FacebookPageConfig
  ): Promise<AiGeneratedCopy> {
    const apiKey = this.getApiKey(config);
    const useAi = config.useDeepseekAi !== false && Boolean(apiKey);

    // If AI is disabled or no key is present, use the deterministic anti-spam rotation
    if (!useAi || !apiKey) {
      return this.generateFallbackCopy(matches, postType, config);
    }

    const start = Date.now();
    const model = this.getModel(config);

    try {
      // Build match context summary for the LLM
      const matchSummaries = matches.map(m => {
        const timeBadge = postType === 'HT' ? 'HT' : postType === 'FT' ? 'FT' : `${m.minute || 0}'`;
        return `${m.homeTeam.name} ${m.homeScore} - ${m.awayScore} ${m.awayTeam.name} (${timeBadge}) [${m.league?.name || 'League'}]`;
      }).slice(0, 15); // limit to top 15 matches for prompt efficiency

      const typeInstruction =
        postType === 'LIVE'
          ? 'POST TYPE: LIVE IN-PLAY ROUNDUP. Focus on matches currently underway, momentum shifts, and live tension.'
          : postType === 'HT'
          ? 'POST TYPE: HALF-TIME ROUNDUP. Focus on scores at the break, teams needing a turnaround, and second-half anticipation.'
          : 'POST TYPE: FULL-TIME RESULTS. Focus on completed results, statement victories, decisive points, and upsets.';

      const systemPrompt = `You are a premier football journalist and social media editor for a renowned global football page.
Your objective is to craft an authentic, human-sounding post headline and framing that engages fans naturally and NEVER triggers Facebook's automated spam or bot detection algorithms.

STRICT GUIDELINES:
1. Avoid repetitive AI tropes ("drama unfolds", "heart-stopping action", "football magic", "battle of titans").
2. Write with authentic football terminology ("clean sheet", "counter-punch", "breakthrough", "statement win", "stalemate").
3. Keep the headline concise, vivid, and punchy with 1-2 appropriate emojis.
4. The subhead must be a natural 1-sentence status statement including match count.
5. The closing must be an engaging, organic conversation starter directed at football fans (e.g. asking for opinions, game of the day, or second-half predictions).
6. Provide exactly 2 to 3 smart hashtags matching the leagues present. NEVER more than 3 hashtags.

You MUST reply ONLY with a valid JSON object in this exact schema:
{
  "headline": "...",
  "subhead": "...",
  "closing": "...",
  "hashtags": "..."
}`;

      const userPrompt = `${typeInstruction}
ACTIVE MATCHES (${matches.length} total):
${matchSummaries.join('\n')}

Generate the headline, subhead, closing, and hashtags for this Facebook post.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const res = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 300,
          temperature: 0.8, // Good creativity for fresh variation
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        console.warn(`[DeepSeek AI] Request failed with HTTP ${res.status}, using algorithmic fallback.`);
        return this.generateFallbackCopy(matches, postType, config);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return this.generateFallbackCopy(matches, postType, config);
      }

      const parsed = JSON.parse(content);
      if (!parsed.headline || !parsed.subhead) {
        return this.generateFallbackCopy(matches, postType, config);
      }

      return {
        headline: parsed.headline.trim(),
        subhead: parsed.subhead.trim(),
        closing: parsed.closing?.trim() || 'Which team are you backing today? Have your say below!',
        hashtags: parsed.hashtags?.trim() || generateSmartDynamicHashtags(matches, postType),
        isAiGenerated: true,
        modelUsed: model,
        latencyMs,
      };
    } catch (err: any) {
      console.warn(`[DeepSeek AI] Error during copy generation: ${err.message}. Using fallback.`);
      return this.generateFallbackCopy(matches, postType, config);
    }
  }

  /**
   * Deterministic high-variety anti-spam fallback
   */
  private static generateFallbackCopy(
    matches: Match[],
    postType: 'LIVE' | 'HT' | 'FT',
    config: FacebookPageConfig
  ): AiGeneratedCopy {
    const tz = config.timezone || 'UTC';
    const now = new Date();
    let timeStr = '';
    try {
      timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz, timeZoneName: 'short' });
    } catch {
      timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
    }

    const epoch5m = Math.floor(Date.now() / (5 * 60 * 1000));
    const seed = Math.abs(epoch5m + matches.length + (matches[0]?.id ? matches[0].id.charCodeAt(0) : 0));

    let headline = '';
    let subhead = '';
    let closing = '';

    if (postType === 'LIVE') {
      headline = LIVE_HEADLINES[seed % LIVE_HEADLINES.length];
      const subGen = LIVE_SUBHEADS[seed % LIVE_SUBHEADS.length];
      subhead = subGen(matches.length, timeStr);
      closing = LIVE_CLOSINGS[seed % LIVE_CLOSINGS.length];
    } else if (postType === 'HT') {
      headline = HT_HEADLINES[seed % HT_HEADLINES.length];
      const subGen = HT_SUBHEADS[seed % HT_SUBHEADS.length];
      subhead = subGen(matches.length, timeStr);
      closing = HT_CLOSINGS[seed % HT_CLOSINGS.length];
    } else {
      headline = FT_HEADLINES[seed % FT_HEADLINES.length];
      const subGen = FT_SUBHEADS[seed % FT_SUBHEADS.length];
      subhead = subGen(matches.length, timeStr);
      closing = FT_CLOSINGS[seed % FT_CLOSINGS.length];
    }

    const hashtags = generateSmartDynamicHashtags(matches, postType);

    return {
      headline,
      subhead,
      closing,
      hashtags,
      isAiGenerated: false,
    };
  }
}
