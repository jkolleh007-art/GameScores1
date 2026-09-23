import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Share2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Settings,
  Send,
  RefreshCw,
  Sliders,
  FileText,
  ExternalLink,
  ShieldCheck,
  Zap,
  Save,
  Trash2,
  Layers,
  Sparkles,
  ListOrdered,
  Eye,
  Calendar,
  Play,
  Shield,
  Activity,
  Globe,
  Flag,
  Trophy,
  Lock,
  Layout,
  Bot,
  Cpu,
} from 'lucide-react';
import { FacebookPageConfig, FacebookPostRecord, Match, PublishedFtRecord, PublishedHtRecord, DailyLeagueSelection } from '../types';
import { DailyLeagueSelectionView } from './DailyLeagueSelectionView';
import { useAdminAuth } from '../context/AdminAuthContext';

interface FacebookPublisherViewProps {
  onNotify?: (msg: string) => void;
  initialSubSection?: 'leagues' | 'roundup' | 'halftime' | 'results' | 'settings' | 'history' | 'templates';
}

export const FacebookPublisherView: React.FC<FacebookPublisherViewProps> = ({ onNotify, initialSubSection }) => {
  const { isAuthenticated, authFetch, setShowLoginModal } = useAdminAuth();
  const [config, setConfig] = useState<FacebookPageConfig>({
    pageId: '',
    isConnected: false,
    autoPublishEnabled: false,
    publishingMode: 'roundup',
    roundupFormat: 'default',
    roundupIntervalMinutes: 15,
    minPostSpacingSeconds: 30,
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
  const [posts, setPosts] = useState<FacebookPostRecord[]>([]);
  const [pageIdInput, setPageIdInput] = useState('');
  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingPost, setIsTestingPost] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [manualMessage, setManualMessage] = useState('');
  const [isManualPosting, setIsManualPosting] = useState(false);
  const [activeSubSection, setActiveSubSection] = useState<'leagues' | 'roundup' | 'halftime' | 'results' | 'settings' | 'history' | 'templates'>(
    initialSubSection || 'leagues'
  );
  const [dailySelection, setDailySelection] = useState<DailyLeagueSelection | null>(null);

  useEffect(() => {
    if (initialSubSection) {
      setActiveSubSection(initialSubSection);
    }
  }, [initialSubSection]);

  // Roundup / Single post state
  const [roundupPreview, setRoundupPreview] = useState<string>('');
  const [roundupMatchCount, setRoundupMatchCount] = useState<number>(0);
  const [roundupMatches, setRoundupMatches] = useState<Match[]>([]);
  const [isLoadingRoundupPreview, setIsLoadingRoundupPreview] = useState<boolean>(false);
  const [isPublishingRoundup, setIsPublishingRoundup] = useState<boolean>(false);
  const [customRoundupText, setCustomRoundupText] = useState<string>('');
  const [isEditingRoundupText, setIsEditingRoundupText] = useState<boolean>(false);

  // Full-Time Results Grouping & De-duplication State
  const [resultsPreview, setResultsPreview] = useState<string>('');
  const [resultsMatchCount, setResultsMatchCount] = useState<number>(0);
  const [resultsTotalFinished, setResultsTotalFinished] = useState<number>(0);
  const [resultsAlreadyPublishedCount, setResultsAlreadyPublishedCount] = useState<number>(0);
  const [resultsMatches, setResultsMatches] = useState<Match[]>([]);
  const [publishedFtHistory, setPublishedFtHistory] = useState<PublishedFtRecord[]>([]);
  const [isLoadingResultsPreview, setIsLoadingResultsPreview] = useState<boolean>(false);
  const [isPublishingResults, setIsPublishingResults] = useState<boolean>(false);
  const [resultsDateOffset, setResultsDateOffset] = useState<number>(0);
  const [filterPublishedFt, setFilterPublishedFt] = useState<boolean>(true);
  const [customResultsText, setCustomResultsText] = useState<string>('');
  const [isEditingResultsText, setIsEditingResultsText] = useState<boolean>(false);
  const [isClearingFtHistory, setIsClearingFtHistory] = useState<boolean>(false);
  const [isMarkingCurrentAsPublished, setIsMarkingCurrentAsPublished] = useState<boolean>(false);

  // Half-Time Games Grouping & De-duplication State
  const [htPreview, setHtPreview] = useState<string>('');
  const [htMatchCount, setHtMatchCount] = useState<number>(0);
  const [htTotalMatches, setHtTotalMatches] = useState<number>(0);
  const [htAlreadyPublishedCount, setHtAlreadyPublishedCount] = useState<number>(0);
  const [htMatches, setHtMatches] = useState<Match[]>([]);
  const [publishedHtHistory, setPublishedHtHistory] = useState<PublishedHtRecord[]>([]);
  const [isLoadingHtPreview, setIsLoadingHtPreview] = useState<boolean>(false);
  const [isPublishingHt, setIsPublishingHt] = useState<boolean>(false);
  const [filterPublishedHt, setFilterPublishedHt] = useState<boolean>(true);
  const [customHtText, setCustomHtText] = useState<string>('');
  const [isEditingHtText, setIsEditingHtText] = useState<boolean>(false);
  const [isClearingHtHistory, setIsClearingHtHistory] = useState<boolean>(false);

  // DeepSeek AI State
  const [deepseekKeyInput, setDeepseekKeyInput] = useState('');
  const [deepseekModelInput, setDeepseekModelInput] = useState('deepseek-chat');
  const [isTestingDeepseek, setIsTestingDeepseek] = useState(false);
  const [deepseekTestResult, setDeepseekTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [isGeneratingAiLive, setIsGeneratingAiLive] = useState(false);
  const [isGeneratingAiHt, setIsGeneratingAiHt] = useState(false);
  const [isGeneratingAiResults, setIsGeneratingAiResults] = useState(false);
  const [aiLiveMeta, setAiLiveMeta] = useState<{ headline?: string; latencyMs?: number; isAiGenerated?: boolean } | null>(null);
  const [aiHtMeta, setAiHtMeta] = useState<{ headline?: string; latencyMs?: number; isAiGenerated?: boolean } | null>(null);
  const [aiResultsMeta, setAiResultsMeta] = useState<{ headline?: string; latencyMs?: number; isAiGenerated?: boolean } | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [retryingPostId, setRetryingPostId] = useState<string | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isResettingCooldown, setIsResettingCooldown] = useState(false);
  const [queueMetrics, setQueueMetrics] = useState<{
    queueLength: number;
    isProcessing: boolean;
    recentPublishCount: number;
    maxPerMinute: number;
    isCooldown?: boolean;
    cooldownSecondsRemaining?: number;
    cooldownReason?: string;
    minPostSpacingSeconds?: number;
  } | null>(null);

  const isEditingPageId = useRef(false);

  const fetchConfigAndHistory = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetch('/api/facebook/config').then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch('/api/facebook/posts').then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch('/api/facebook/queue-status').then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch('/api/leagues/daily-selection').then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ]);

      const [cfgResult, postsResult, queueResult, leaguesResult] = results;

      if (cfgResult.status === 'fulfilled' && cfgResult.value?.success && cfgResult.value.data) {
        setConfig((prev) => ({ ...prev, ...cfgResult.value.data }));
        // Only initialize input if user hasn't started typing into it
        if (!isEditingPageId.current) {
          setPageIdInput(cfgResult.value.data.pageId || '');
        }
        if (cfgResult.value.data.deepseekApiKey) {
          setDeepseekKeyInput(cfgResult.value.data.deepseekApiKey);
        }
        if (cfgResult.value.data.deepseekModel) {
          setDeepseekModelInput(cfgResult.value.data.deepseekModel);
        }
      }

      if (postsResult.status === 'fulfilled' && postsResult.value?.success && Array.isArray(postsResult.value.data)) {
        setPosts(postsResult.value.data);
      }

      if (queueResult.status === 'fulfilled' && queueResult.value?.success && queueResult.value.queue) {
        setQueueMetrics(queueResult.value.queue);
      }

      if (leaguesResult.status === 'fulfilled' && leaguesResult.value?.success && leaguesResult.value.data) {
        setDailySelection(leaguesResult.value.data);
      }
    } catch (e: any) {
      // Benign network or server restart, keep existing state
      console.warn('Facebook data sync notice:', e?.message || e);
    }
  }, []);

  const fetchRoundupPreview = useCallback(async () => {
    setIsLoadingRoundupPreview(true);
    try {
      const res = await fetch('/api/facebook/preview-roundup');
      const data = await res.json();
      if (data.success) {
        setRoundupPreview(data.previewText || '');
        if (!isEditingRoundupText) {
          setCustomRoundupText(data.previewText || '');
        }
        setRoundupMatchCount(data.matchCount || 0);
        setRoundupMatches(data.matches || []);
      }
    } catch (err: any) {
      console.warn('Error fetching roundup preview:', err?.message || err);
    } finally {
      setIsLoadingRoundupPreview(false);
    }
  }, [isEditingRoundupText]);

  const handleTestDeepseek = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsTestingDeepseek(true);
    setDeepseekTestResult(null);
    try {
      const res = await authFetch('/api/facebook/deepseek/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: deepseekKeyInput.trim() || undefined,
          model: deepseekModelInput.trim() || 'deepseek-chat',
        }),
      });
      const data = await res.json();
      setDeepseekTestResult(data);
      if (data.success && onNotify) {
        onNotify(data.message || 'DeepSeek AI connected successfully!');
      }
    } catch (e: any) {
      setDeepseekTestResult({ success: false, message: e.message || 'Failed to connect to DeepSeek API' });
    } finally {
      setIsTestingDeepseek(false);
    }
  };

  const handleGenerateAiLive = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsGeneratingAiLive(true);
    try {
      const res = await authFetch('/api/facebook/deepseek/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postType: 'LIVE' }),
      });
      const data = await res.json();
      if (data.success && data.previewText) {
        setRoundupPreview(data.previewText);
        setCustomRoundupText(data.previewText);
        setAiLiveMeta({
          headline: data.aiCopy?.headline,
          latencyMs: data.aiCopy?.latencyMs,
          isAiGenerated: data.aiCopy?.isAiGenerated,
        });
        if (onNotify) {
          onNotify(`AI headline generated: "${data.aiCopy?.headline || 'Updated'}"`);
        }
      } else {
        alert(data.error || 'Failed to generate copy');
      }
    } catch (e: any) {
      console.warn('AI live generate error:', e);
    } finally {
      setIsGeneratingAiLive(false);
    }
  };

  const handleGenerateAiHt = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsGeneratingAiHt(true);
    try {
      const res = await authFetch('/api/facebook/deepseek/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postType: 'HT' }),
      });
      const data = await res.json();
      if (data.success && data.previewText) {
        setHtPreview(data.previewText);
        setCustomHtText(data.previewText);
        setAiHtMeta({
          headline: data.aiCopy?.headline,
          latencyMs: data.aiCopy?.latencyMs,
          isAiGenerated: data.aiCopy?.isAiGenerated,
        });
        if (onNotify) {
          onNotify(`AI Half-Time headline generated: "${data.aiCopy?.headline || 'Updated'}"`);
        }
      } else {
        alert(data.error || 'Failed to generate HT copy');
      }
    } catch (e: any) {
      console.warn('AI HT generate error:', e);
    } finally {
      setIsGeneratingAiHt(false);
    }
  };

  const handleGenerateAiResults = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsGeneratingAiResults(true);
    try {
      const res = await authFetch('/api/facebook/deepseek/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postType: 'FT', offset: resultsDateOffset }),
      });
      const data = await res.json();
      if (data.success && data.previewText) {
        setResultsPreview(data.previewText);
        setCustomResultsText(data.previewText);
        setAiResultsMeta({
          headline: data.aiCopy?.headline,
          latencyMs: data.aiCopy?.latencyMs,
          isAiGenerated: data.aiCopy?.isAiGenerated,
        });
        if (onNotify) {
          onNotify(`AI Results headline generated: "${data.aiCopy?.headline || 'Updated'}"`);
        }
      } else {
        alert(data.error || 'Failed to generate FT copy');
      }
    } catch (e: any) {
      console.warn('AI results generate error:', e);
    } finally {
      setIsGeneratingAiResults(false);
    }
  };

  const handlePublishRoundup = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsPublishingRoundup(true);
    setStatusMessage(null);
    try {
      const res = await authFetch('/api/facebook/publish-roundup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customMessage: isEditingRoundupText ? customRoundupText : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `🎉 ${data.message} Post is scheduled and being dispatched with safe spacing.`,
        });
        await fetchConfigAndHistory();
        await fetchRoundupPreview();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to enqueue all-game roundup post.',
        });
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Error occurred while publishing roundup.',
      });
    } finally {
      setIsPublishingRoundup(false);
    }
  };

  const fetchPublishedFtHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/facebook/published-ft-matches');
      const data = await res.json();
      if (data.success && Array.isArray(data.records)) {
        setPublishedFtHistory(data.records);
      }
    } catch (e) {
      console.warn('Error fetching published FT matches:', e);
    }
  }, []);

  const fetchResultsPreview = useCallback(async (offsetOverride?: number, filterOverride?: boolean) => {
    setIsLoadingResultsPreview(true);
    const offset = offsetOverride !== undefined ? offsetOverride : resultsDateOffset;
    const filter = filterOverride !== undefined ? filterOverride : filterPublishedFt;
    try {
      const res = await fetch(`/api/facebook/preview-results-roundup?offset=${offset}&filterPublished=${filter}`);
      const data = await res.json();
      if (data.success) {
        if (!isEditingResultsText) {
          setResultsPreview(data.previewText || '');
          setCustomResultsText(data.previewText || '');
        }
        setResultsMatchCount(data.matchCount || 0);
        setResultsTotalFinished(data.totalCompleted || 0);
        setResultsAlreadyPublishedCount(data.alreadyPublishedCount || 0);
        setResultsMatches(data.matches || []);
      }
    } catch (err: any) {
      console.warn('Error fetching results preview:', err?.message || err);
    } finally {
      setIsLoadingResultsPreview(false);
    }
  }, [resultsDateOffset, filterPublishedFt, isEditingResultsText]);

  const handlePublishResults = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsPublishingResults(true);
    setStatusMessage(null);
    try {
      const res = await authFetch('/api/facebook/publish-results-roundup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: resultsDateOffset,
          customMessage: isEditingResultsText ? customResultsText : undefined,
          forceIncludeAll: !filterPublishedFt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `🎉 ${data.message}`,
        });
        await fetchConfigAndHistory();
        await fetchResultsPreview();
        await fetchPublishedFtHistory();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to publish grouped Full-Time results.',
        });
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Error occurred while publishing Full-Time results.',
      });
    } finally {
      setIsPublishingResults(false);
    }
  };

  const handleClearFtHistory = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsClearingFtHistory(true);
    try {
      const res = await authFetch('/api/facebook/clear-published-ft-matches', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message });
        await fetchResultsPreview();
        await fetchPublishedFtHistory();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to clear history' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Error clearing history' });
    } finally {
      setIsClearingFtHistory(false);
    }
  };

  const handleMarkCurrentAsPublished = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsMarkingCurrentAsPublished(true);
    try {
      const res = await authFetch('/api/facebook/mark-current-results-as-published', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: resultsDateOffset }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message });
        await fetchResultsPreview();
        await fetchPublishedFtHistory();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to mark matches' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Error marking matches' });
    } finally {
      setIsMarkingCurrentAsPublished(false);
    }
  };

  const fetchPublishedHtHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/facebook/published-ht-matches');
      const data = await res.json();
      if (data.success && Array.isArray(data.records)) {
        setPublishedHtHistory(data.records);
      }
    } catch (e) {
      console.warn('Error fetching published HT matches:', e);
    }
  }, []);

  const fetchHtPreview = useCallback(async (filterOverride?: boolean) => {
    setIsLoadingHtPreview(true);
    const filter = filterOverride !== undefined ? filterOverride : filterPublishedHt;
    try {
      const res = await fetch(`/api/facebook/preview-halftime-roundup?filterPublished=${filter}`);
      const data = await res.json();
      if (data.success) {
        if (!isEditingHtText) {
          setHtPreview(data.previewText || '');
          setCustomHtText(data.previewText || '');
        }
        setHtMatchCount(data.matchCount || 0);
        setHtTotalMatches(data.totalHalfTime || 0);
        setHtAlreadyPublishedCount(data.alreadyPublishedCount || 0);
        setHtMatches(data.matches || []);
      }
    } catch (err: any) {
      console.warn('Error fetching HT preview:', err?.message || err);
    } finally {
      setIsLoadingHtPreview(false);
    }
  }, [filterPublishedHt, isEditingHtText]);

  const handlePublishHt = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsPublishingHt(true);
    setStatusMessage(null);
    try {
      const res = await authFetch('/api/facebook/publish-halftime-roundup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customMessage: isEditingHtText ? customHtText : undefined,
          forceIncludeAll: !filterPublishedHt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `🎉 ${data.message}`,
        });
        await fetchConfigAndHistory();
        await fetchHtPreview();
        await fetchPublishedHtHistory();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to publish grouped Half-Time scores.',
        });
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Error occurred while publishing Half-Time scores.',
      });
    } finally {
      setIsPublishingHt(false);
    }
  };

  const handleClearHtHistory = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsClearingHtHistory(true);
    try {
      const res = await authFetch('/api/facebook/clear-published-ht-matches', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: data.message });
        await fetchHtPreview();
        await fetchPublishedHtHistory();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to clear HT history' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setIsClearingHtHistory(false);
    }
  };

  const handleResetCooldown = async () => {
    setIsResettingCooldown(true);
    try {
      const res = await fetch('/api/facebook/reset-cooldown', { method: 'POST' });
      const json = await res.json();
      if (json.cooldownStillActive) {
        setStatusMessage({
          type: 'info',
          text: `Acknowledged: Meta Anti-Spam protection active for ${json.cooldownRemainingSeconds}s. Publishing will safely resume once the cooldown timer expires.`,
        });
      } else if (json.success) {
        setRefreshNotice('Cooldown cleared — publisher resumed');
        setStatusMessage({ type: 'success', text: 'Facebook publisher resumed successfully.' });
        setTimeout(() => setRefreshNotice(null), 3500);
      } else {
        setStatusMessage({ type: 'error', text: json.error || 'Failed to reset status' });
      }
      await fetchConfigAndHistory();
    } catch (e: any) {
      console.error('Error acknowledging cooldown:', e);
      setStatusMessage({ type: 'error', text: 'Error contacting server' });
    } finally {
      setIsResettingCooldown(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      await fetchConfigAndHistory();
      setRefreshNotice('Refreshed just now');
      setTimeout(() => setRefreshNotice(null), 3500);
    } catch (err: any) {
      setRefreshNotice('Error refreshing');
      setTimeout(() => setRefreshNotice(null), 3500);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetryAllSkipped = async () => {
    setIsRetryingAll(true);
    try {
      const res = await fetch('/api/facebook/retry-all-skipped', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setRefreshNotice(json.message || 'Skipped posts re-enqueued');
        await fetchConfigAndHistory();
        setTimeout(() => setRefreshNotice(null), 3500);
      }
    } catch (e: any) {
      console.error('Error retrying skipped posts:', e);
    } finally {
      setIsRetryingAll(false);
    }
  };

  const handleRetrySinglePost = async (postId: string) => {
    setRetryingPostId(postId);
    try {
      const res = await fetch(`/api/facebook/retry-post/${postId}`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        await fetchConfigAndHistory();
      }
    } catch (e: any) {
      console.error('Error retrying post:', e);
    } finally {
      setRetryingPostId(null);
    }
  };

  const [isClearingQueue, setIsClearingQueue] = useState(false);

  const handleClearQueue = async () => {
    setIsClearingQueue(true);
    try {
      const res = await fetch('/api/facebook/clear-queue', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ text: data.message, type: 'success' });
        await fetchConfigAndHistory();
      } else {
        setStatusMessage({ text: data.error || 'Failed to clear queue', type: 'error' });
      }
    } catch {
      setStatusMessage({ text: 'Error clearing queue', type: 'error' });
    } finally {
      setIsClearingQueue(false);
    }
  };

  const handleClearLogs = async () => {
    setIsClearingLogs(true);
    setIsConfirmingClear(false);
    try {
      const res = await fetch('/api/facebook/posts', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setPosts([]);
        setRefreshNotice('All post logs cleared');
        setTimeout(() => setRefreshNotice(null), 3500);
      } else {
        setStatusMessage({ type: 'error', text: json.error || 'Failed to clear logs' });
      }
    } catch (e: any) {
      console.error('Error clearing logs:', e);
      setStatusMessage({ type: 'error', text: e.message || 'Failed to clear logs' });
    } finally {
      setIsClearingLogs(false);
    }
  };

  useEffect(() => {
    if (!isConfirmingClear) return;
    const timer = setTimeout(() => setIsConfirmingClear(false), 5000);
    return () => clearTimeout(timer);
  }, [isConfirmingClear]);

  useEffect(() => {
    fetchConfigAndHistory();
    fetchRoundupPreview();
    const interval = setInterval(() => {
      fetchConfigAndHistory();
      fetchRoundupPreview();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchConfigAndHistory, fetchRoundupPreview]);

  const handleSaveConfig = async (updatedConfig: Partial<FacebookPageConfig>) => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await authFetch('/api/facebook/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setConfig((prev) => ({ ...prev, ...data.data }));
        setStatusMessage({ type: 'success', text: 'Facebook configuration saved successfully!' });
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to save configuration' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Failed to save configuration' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExplicitSave = async () => {
    if (!pageIdInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a Facebook Page ID before saving.' });
      return;
    }
    await handleSaveConfig({
      pageId: pageIdInput.trim(),
      ...(accessTokenInput.trim() ? { pageAccessToken: accessTokenInput.trim() } : {}),
      ...(deepseekKeyInput.trim() ? { deepseekApiKey: deepseekKeyInput.trim() } : {}),
      deepseekModel: deepseekModelInput.trim() || 'deepseek-chat',
      isConnected: true,
    });
  };

  const handleSendTestPost = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    const targetId = pageIdInput.trim() || config?.pageId;
    if (!targetId) {
      setStatusMessage({ type: 'error', text: 'Please enter or save your Facebook Page ID first.' });
      return;
    }

    setIsTestingPost(true);
    setStatusMessage(null);
    try {
      const res = await authFetch('/api/facebook/test-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: targetId,
          accessToken: accessTokenInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `🎉 Test post published successfully to Facebook Page! (Post ID: ${data.fbPostId || 'sent'})`,
        });
        fetchConfigAndHistory();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to publish test post. Verify your Page Access Token and permissions.',
        });
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Error occurred while sending test post.',
      });
    } finally {
      setIsTestingPost(false);
    }
  };

  const handleVerifyCredentials = async () => {
    setIsVerifying(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/facebook/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageIdInput,
          accessToken: accessTokenInput,
        }),
      });
      if (!res.ok) {
        throw new Error(`Verification request returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Verified! Connected to "${data.data?.page?.name || pageIdInput}" (${data.data?.page?.category || 'Page'}).`,
        });
        // Save verified credentials
        await handleSaveConfig({
          pageId: pageIdInput,
          pageAccessToken: accessTokenInput,
          pageName: data.data?.page?.name,
          category: data.data?.page?.category,
          isConnected: true,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data.data?.error || data.error || 'Verification failed. Please ensure Page ID and Access Token are valid.',
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Verification request failed' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualPost = async () => {
    if (!manualMessage.trim()) return;
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setIsManualPosting(true);
    try {
      const res = await authFetch('/api/facebook/publish-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: 'manual',
          matchTitle: 'Manual Announcement',
          leagueName: 'Live Announcement',
          eventType: 'STATUS_CHANGE',
          message: manualMessage,
        }),
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setManualMessage('');
        setStatusMessage({ type: 'success', text: 'Post enqueued for background publishing!' });
        fetchConfigAndHistory();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to enqueue post' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Failed to send post' });
    } finally {
      setIsManualPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Integration Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Facebook Page Publishing Platform</h2>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                    config?.isConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {config?.isConnected ? 'Active & Connected' : 'Unconnected'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Automated publishing of live football goals, red cards, half-time and full-time results to Meta Pages.
              </p>
            </div>
          </div>

          {/* Top Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Send Test Post button in header */}
            <button
              id="header-test-post-btn"
              onClick={handleSendTestPost}
              disabled={isTestingPost}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
              title="Publish a sample test score update to verify Meta credentials"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isTestingPost ? 'Sending...' : 'Send Test Post'}</span>
            </button>

            {/* Quick Auto-Publish Master Switch */}
            {config && (
              <div className="flex items-center space-x-2 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-300 font-semibold">Auto-Publish:</span>
                <button
                  id="auto-publish-toggle"
                  onClick={() =>
                    handleSaveConfig({
                      autoPublishEnabled: !config.autoPublishEnabled,
                    })
                  }
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all ${
                    config.autoPublishEnabled
                      ? 'bg-emerald-600 text-white shadow-emerald-500/20 shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {config.autoPublishEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status notification banner */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-lg border text-xs flex items-center space-x-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Daily League Blackout Banner (If 0 leagues selected for today) */}
        {dailySelection && dailySelection.selectedLeagueIds && dailySelection.selectedLeagueIds.length === 0 && (
          <div className="mt-4 p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-300">
            <div className="flex items-center space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>League Blackout Active for Today ({dailySelection.date}):</strong> No leagues have been selected for today.
                Games from unselected leagues are hidden and automated Facebook posting is blocked until you choose today's leagues.
              </span>
            </div>
            <button
              id="banner-configure-leagues-btn"
              onClick={() => setActiveSubSection('leagues')}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto shadow-sm"
            >
              Select Today's Leagues
            </button>
          </div>
        )}

        {/* Manual Click-To-Post Protection Banner */}
        {config && !config.autoPublishEnabled && (
          <div className="mt-4 p-3.5 bg-blue-950/40 border border-blue-500/40 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-blue-200">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <strong className="text-white">Admin Click-To-Post Mode Active:</strong> Background automated posting is turned off to protect against Facebook spam detection and blocking. Use the <strong>"Publish Now"</strong> buttons below whenever you want to post. Posts automatically use dynamic anti-spam phrasing and rotating hashtags!
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                Anti-Spam Protected
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Subtabs */}
      <div className="flex border-b border-slate-800 space-x-2 text-xs overflow-x-auto">
        <button
          id="tab-leagues-btn"
          onClick={() => setActiveSubSection('leagues')}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'leagues'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Daily League Selection</span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
              dailySelection && dailySelection.selectedLeagueIds && dailySelection.selectedLeagueIds.length > 0
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            }`}
          >
            {dailySelection?.selectedLeagueIds?.length || 0} Today
          </span>
        </button>

        <button
          id="tab-roundup-btn"
          onClick={() => {
            setActiveSubSection('roundup');
            fetchRoundupPreview();
          }}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'roundup'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>All Games in 1 Post</span>
          <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Anti-Spam
          </span>
        </button>

        <button
          id="tab-halftime-btn"
          onClick={() => {
            setActiveSubSection('halftime');
            fetchHtPreview();
            fetchPublishedHtHistory();
          }}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'halftime'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span>Half-Time Games</span>
          <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
            All HT Games
          </span>
        </button>

        <button
          id="tab-results-btn"
          onClick={() => {
            setActiveSubSection('results');
            fetchResultsPreview();
            fetchPublishedFtHistory();
          }}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'results'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flag className="w-3.5 h-3.5 text-amber-400" />
          <span>Full-Time Results</span>
          <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Grouped & De-duplicated
          </span>
        </button>

        <button
          onClick={() => setActiveSubSection('settings')}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'settings'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Page API Credentials & Setup</span>
        </button>

        <button
          onClick={() => setActiveSubSection('history')}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'history'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Publish Queue & History ({posts.length})</span>
        </button>

        <button
          onClick={() => setActiveSubSection('templates')}
          className={`flex items-center space-x-1.5 px-4 py-2.5 font-semibold border-b-2 transition-colors shrink-0 ${
            activeSubSection === 'templates'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Post Templates</span>
        </button>
      </div>

      {/* Global Cooldown Alert Banner (Visible across all subtabs) */}
      {queueMetrics?.isCooldown && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 mt-0.5 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                  Meta Anti-Spam Velocity Protection Active
                </h4>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono font-semibold">
                  Subcode 1390008 Throttling
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                {queueMetrics.cooldownReason ||
                  'Facebook temporarily limits how often actions can be taken. The publisher has paused automatically to protect your Page reputation and will resume with safe spacing.'}
              </p>
              <div className="text-[11px] text-amber-300/80 font-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Auto-resumes in: <strong className="text-white text-xs">{queueMetrics.cooldownSecondsRemaining}s</strong></span>
                </span>
                <span>•</span>
                <span>Post pacing: 1 post every {queueMetrics.minPostSpacingSeconds || 25}s</span>
                {queueMetrics.queueLength > 0 && (
                  <>
                    <span>•</span>
                    <span>{queueMetrics.queueLength} post{queueMetrics.queueLength === 1 ? '' : 's'} queued</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 self-stretch sm:self-auto">
            {queueMetrics.queueLength > 0 && (
              <button
                id="global-clear-queue-btn"
                onClick={handleClearQueue}
                disabled={isClearingQueue}
                className="shrink-0 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-2 rounded-lg transition-colors font-medium flex items-center space-x-1.5 self-stretch sm:self-auto justify-center"
                title="Remove pending individual posts from queue to stop repeat rate limit triggers"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{isClearingQueue ? 'Clearing...' : 'Clear Backlogged Queue'}</span>
              </button>
            )}
            <button
              id="global-reset-cooldown-btn"
              onClick={handleResetCooldown}
              disabled={isResettingCooldown}
              className="shrink-0 text-xs bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-200 border border-amber-500/40 px-3 py-2 rounded-lg transition-colors font-medium flex items-center space-x-1.5 self-stretch sm:self-auto justify-center"
              title="Manually clear the cooldown timer and resume queue"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-400 ${isResettingCooldown ? 'animate-spin' : ''}`} />
              <span>{isResettingCooldown ? 'Resuming...' : 'Force Resume Now'}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUBSECTION: Daily League Selection (24-Hour Scope) */}
      {activeSubSection === 'leagues' && (
        <DailyLeagueSelectionView
          onSelectionSaved={(updatedSelection) => {
            setDailySelection(updatedSelection);
            fetchRoundupPreview();
            fetchResultsPreview();
          }}
        />
      )}

      {/* SUBSECTION 0: All Live Games in 1 Post (Scoreboard Roundup) */}
      {activeSubSection === 'roundup' && (
        <div className="space-y-6">
          {/* Anti-Spam Strategy Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Meta Anti-Spam Protection Strategy
                  </h3>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                    Zero-Spam Strategy
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  Facebook automatically limits posting frequency (<span className="font-mono text-amber-300">OAuthException 1390008</span>) to protect the community from spam. When multiple live matches trigger separate posts for every goal or card, Facebook temporarily blocks publishing.
                </p>
                <p className="text-xs text-emerald-300 font-medium mt-1.5">
                  <strong>Recommended:</strong> Aggregate all live games into a <strong>single live scoreboard post</strong>! Your followers get a clean, comprehensive matchday score overview in one post, and your Facebook Page stays completely safe from spam lockouts.
                </p>
              </div>
            </div>
          </div>

          {/* Publishing Mode: Multi-Game Scoreboard Roundup */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-bold text-white">
                      Automated Live Scoreboard (All Games in 1 Post)
                    </h4>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold uppercase">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Combines all currently ongoing live matches into a single Facebook post at your scheduled interval (every {config.roundupIntervalMinutes || 5} minutes). Individual single-game spam is completely disabled.
                  </p>
                </div>
              </div>
              <div className="text-[11px] text-emerald-400/90 font-medium shrink-0 bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-800/40 flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>100% Protected from Meta Rate Limits</span>
              </div>
            </div>
          </div>

          {/* Timing, Format & Pacing Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Scoreboard Format Style */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Layout className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Scoreboard Layout</span>
                </label>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {(config.roundupFormat || 'default') === 'default' ? 'Standard' : 'Emoji'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Visual presentation style for live scoreboards & grouped results.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveConfig({ roundupFormat: 'default' });
                    fetchRoundupPreview();
                    fetchResultsPreview();
                    fetchHtPreview();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                    (config.roundupFormat || 'default') === 'default'
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Standard (Default)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveConfig({ roundupFormat: 'compact_emoji' });
                    fetchRoundupPreview();
                    fetchResultsPreview();
                    fetchHtPreview();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                    config.roundupFormat === 'compact_emoji'
                      ? 'bg-cyan-600 text-white font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Emoji Style
                </button>
              </div>
              <div className="text-[10px] text-slate-400">
                {(config.roundupFormat || 'default') === 'default'
                  ? '✓ Clean league grouping, timing & full stats line'
                  : '✓ Bold digits, half breakdown, compact icon badges & legend'}
              </div>
            </div>

            {/* Scoreboard Post Frequency */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Post Frequency</span>
                </label>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  Every {config.roundupIntervalMinutes || 5} mins
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                How often active live games are compiled into 1 single post.
              </p>
              <div className="flex flex-wrap gap-2">
                {[3, 5, 10, 15, 20, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleSaveConfig({ roundupIntervalMinutes: mins })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      (config.roundupIntervalMinutes || 5) === mins
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              {config.lastRoundupPublishedAt && (
                <div className="text-[10px] text-slate-500 pt-1">
                  Last automated post: {new Date(config.lastRoundupPublishedAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Timezone Configuration */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span>Post Timezone</span>
                </label>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {config.timezone || 'UTC'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Timezone displayed on scoreboard posts (e.g., in post header).
              </p>
              <select
                value={config.timezone || 'UTC'}
                onChange={(e) => handleSaveConfig({ timezone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="Africa/Monrovia">Monrovia / West Africa (GMT/UTC+0)</option>
                <option value="Africa/Lagos">Lagos / West Africa (WAT / UTC+1)</option>
                <option value="Africa/Cairo">Cairo / Egypt (EET / UTC+2)</option>
                <option value="Africa/Johannesburg">Johannesburg / SAST (UTC+2)</option>
                <option value="Africa/Nairobi">Nairobi / East Africa (EAT / UTC+3)</option>
                <option value="Europe/London">London / UK (GMT / BST)</option>
                <option value="Europe/Paris">Paris / Central Europe (CET / UTC+1)</option>
                <option value="America/New_York">New York (EST / EDT)</option>
                <option value="America/Chicago">Chicago (CST / CDT)</option>
                <option value="America/Los_Angeles">Los Angeles (PST / PDT)</option>
                <option value="Asia/Dubai">Dubai (GST / UTC+4)</option>
                <option value="Asia/Kolkata">India (IST / UTC+5:30)</option>
                <option value="Asia/Bangkok">Bangkok / Indochina (ICT / UTC+7)</option>
                <option value="Asia/Singapore">Singapore / Hong Kong (SGT / UTC+8)</option>
              </select>
              <div className="text-[10px] text-amber-400/80 pt-1">
                Current Time: {new Date().toLocaleTimeString('en-US', { timeZone: config.timezone || 'UTC', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </div>
            </div>

            {/* Minimum Inter-Post Spacing */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Inter-Post Delay</span>
                </label>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {config.minPostSpacingSeconds || 30}s safe buffer
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Strict delay enforced between consecutive posts sent to Meta API.
              </p>
              <div className="flex flex-wrap gap-2">
                {[20, 25, 30, 45, 60, 90].map((secs) => (
                  <button
                    key={secs}
                    type="button"
                    onClick={() => handleSaveConfig({ minPostSpacingSeconds: secs })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      (config.minPostSpacingSeconds || 30) === secs
                        ? 'bg-emerald-600 text-white font-bold shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {secs}s
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-emerald-400/80 pt-1">
                ✓ Pacing automatically enforced by background queue
              </div>
            </div>
          </div>

          {/* Zero-Conflict Publishing Coordination Status Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-indigo-500/20 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Conflict-Free Publishing Engine
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    Active & Coordinated
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Automated conflict prevention coordinates all 3 publishing streams without collision:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
                    <span className="font-semibold text-amber-300">1. Full-Time Results:</span>
                    <p className="text-slate-400 text-[10px] mt-0.5">Posts as games finish. Priority 1. Never repeated.</p>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
                    <span className="font-semibold text-blue-300">2. Half-Time Scores:</span>
                    <p className="text-slate-400 text-[10px] mt-0.5">Posts at intermission. Priority 2. Never repeated.</p>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5">
                    <span className="font-semibold text-indigo-300">3. Live Scoreboards:</span>
                    <p className="text-slate-400 text-[10px] mt-0.5">Posts every {config.roundupIntervalMinutes || 5}m, spaced by &ge;{config.minPostSpacingSeconds || 30}s buffer.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Scoreboard Preview & 1-Click Publisher */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Live Scoreboard Post Preview</span>
                </h4>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono font-semibold">
                  {roundupMatchCount} {roundupMatchCount === 1 ? 'Live Match' : 'Live Matches'}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  (config.roundupFormat || 'default') === 'default'
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                }`}>
                  {(config.roundupFormat || 'default') === 'default' ? 'Standard Layout' : 'Emoji Scoreboard'}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  id="deepseek-gen-live-btn"
                  onClick={handleGenerateAiLive}
                  disabled={isGeneratingAiLive || roundupMatchCount === 0}
                  className="text-xs bg-indigo-600/90 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold px-2.5 py-1 rounded transition-colors flex items-center space-x-1.5 shadow-sm border border-indigo-400/30 cursor-pointer disabled:cursor-not-allowed"
                  title="Generate a natural, human-written live headline & discussion hook using DeepSeek AI"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAiLive ? 'animate-spin text-amber-300' : 'text-amber-400'}`} />
                  <span>{isGeneratingAiLive ? 'DeepSeek Writing...' : 'Generate with DeepSeek AI'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingRoundupText(!isEditingRoundupText)}
                  className="text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  {isEditingRoundupText ? 'Use Auto Format' : 'Customize Message'}
                </button>

                <button
                  type="button"
                  onClick={fetchRoundupPreview}
                  disabled={isLoadingRoundupPreview}
                  className="text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingRoundupPreview ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>Refresh Preview</span>
                </button>
              </div>
            </div>

            {/* AI Generation Metadata Banner */}
            {aiLiveMeta && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-950/40 border border-indigo-500/30 rounded-lg text-xs">
                <div className="flex items-center space-x-2 text-indigo-300">
                  <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="font-semibold text-white">Headline: "{aiLiveMeta.headline}"</span>
                </div>
                {aiLiveMeta.latencyMs && (
                  <span className="text-[10px] text-indigo-400/80 font-mono">
                    ⚡ DeepSeek · {aiLiveMeta.latencyMs}ms
                  </span>
                )}
              </div>
            )}

            {/* Post text box */}
            <div>
              {isEditingRoundupText ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Customized Post Content:</label>
                  <textarea
                    rows={8}
                    value={customRoundupText}
                    onChange={(e) => setCustomRoundupText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                  />
                </div>
              ) : (
                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed shadow-inner">
                  {roundupPreview || (
                    <span className="text-slate-500 italic">
                      No live matches currently in progress. As matches kick off, this box will automatically compile the full live scoreboard of all active games.
                    </span>
                  )}
                </pre>
              )}
            </div>

            {/* Post Action Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Publishes all {roundupMatchCount} current match score(s) in a single Facebook Page post with real-time minute, cards, and corners.
              </div>

              <button
                type="button"
                id="publish-roundup-now-btn"
                onClick={handlePublishRoundup}
                disabled={isPublishingRoundup || roundupMatchCount === 0 || (!roundupPreview && !customRoundupText)}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-950/40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isPublishingRoundup ? 'Publishing Scoreboard...' : 'Publish All Live Games in 1 Post Now'}
                </span>
              </button>
            </div>
          </div>

          {/* Active Live Matches Detail breakdown */}
          {roundupMatches.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Active Matches in this Roundup ({roundupMatches.length})</span>
                </h4>
                <span className="text-[11px] text-slate-400">
                  Real-time game minutes, corner counts, and card statistics
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {roundupMatches.map((m) => {
                  const stats = m.stats || {};
                  const events = m.events || [];
                  const cornersH = stats.cornersHome ?? 0;
                  const cornersA = stats.cornersAway ?? 0;
                  const evYellowH = events.filter((e) => e.teamSide === 'home' && e.type === 'YELLOW_CARD').length;
                  const evYellowA = events.filter((e) => e.teamSide === 'away' && e.type === 'YELLOW_CARD').length;
                  const yellowH = stats.yellowCardsHome ?? evYellowH;
                  const yellowA = stats.yellowCardsAway ?? evYellowA;
                  const evRedH = events.filter((e) => e.teamSide === 'home' && (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD')).length;
                  const evRedA = events.filter((e) => e.teamSide === 'away' && (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD')).length;
                  const redH = stats.redCardsHome ?? evRedH;
                  const redA = stats.redCardsAway ?? evRedA;

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
                    timeBadge = 'HT (45\')';
                  } else if (m.minute) {
                    const p = m.statusText?.includes('2nd') ? '2nd Half' : m.statusText?.includes('1st') ? '1st Half' : '';
                    timeBadge = `${m.minute}'${p ? ` (${p})` : ''}`;
                  } else {
                    timeBadge = m.statusText || 'LIVE';
                  }

                  return (
                    <div
                      key={m.id}
                      className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-300 truncate max-w-[180px]">
                          🏆 {m.league?.name || 'League'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>⏱️ {timeBadge}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-semibold text-xs text-white">
                        <span className="truncate pr-2">{m.homeTeam.name}</span>
                        <span className="font-mono text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-sm">
                          {m.homeScore} - {m.awayScore}
                        </span>
                        <span className="truncate pl-2 text-right">{m.awayTeam.name}</span>
                      </div>

                      {/* Live Stats Badges: Corners, Yellow Cards, Red Cards */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 flex items-center space-x-1">
                          <span>🚩 Corners:</span>
                          <strong className="text-white font-mono">{cornersH} - {cornersA}</strong>
                        </span>

                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center space-x-1">
                          <span>🟨 Cards:</span>
                          <strong className="text-amber-200 font-mono">{yellowH} - {yellowA}</strong>
                        </span>

                        {(redH > 0 || redA > 0) && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center space-x-1 font-bold">
                            <span>🟥 Red:</span>
                            <strong className="text-rose-200 font-mono">{redH} - {redA}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBSECTION: Grouped Half-Time Games with Anti-Duplicate Protection */}
      {activeSubSection === 'halftime' && (
        <div className="space-y-6">
          {/* Anti-Duplicate Guarantee Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Consolidated Half-Time Scores & Anti-Duplicate Protection
                  </h3>
                  <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                    All HT Games in 1 Post
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  All matches currently at half-time are <strong>grouped by league into a single Facebook post</strong>.
                  The system maintains a persistent registry of published half-time scores: once a match&apos;s half-time score is published, it will <strong>never be repeatedly posted</strong> in subsequent half-time roundups.
                </p>
                <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                  <div className="flex items-center space-x-1.5 text-blue-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Grouped by League</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>No Repeated Half-Time Posts</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-indigo-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Auto Paced & Anti-Spam Safe</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  New HT Games Ready to Post
                </p>
                <p className={`text-xl font-mono font-bold mt-0.5 ${htMatchCount > 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                  {htMatchCount} Matches
                </p>
              </div>
              <div className={`p-2 rounded-lg border ${htMatchCount > 0 ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Already Published at HT Today
                </p>
                <p className="text-xl font-mono font-bold text-amber-400 mt-0.5">
                  {htAlreadyPublishedCount} Matches
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Total Games at Half-Time
                </p>
                <p className="text-xl font-mono font-bold text-slate-200 mt-0.5">
                  {htTotalMatches} in Selected Leagues
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400">
                <Play className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filtering & Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterPublishedHt}
                  onChange={(e) => {
                    setFilterPublishedHt(e.target.checked);
                    fetchHtPreview(e.target.checked);
                  }}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-950 border-slate-700 cursor-pointer"
                />
                <span>Filter out already-published Half-Time matches (Anti-Duplicate)</span>
              </label>

              <span className="text-slate-700 hidden sm:inline">|</span>

              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <Layout className="w-3.5 h-3.5 text-cyan-400" />
                <span>Format:</span>
                <span className="font-semibold text-cyan-300">
                  {(config.roundupFormat || 'default') === 'compact_emoji' ? 'Emoji Style' : 'Standard (Default)'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  fetchHtPreview();
                  fetchPublishedHtHistory();
                }}
                disabled={isLoadingHtPreview}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHtPreview ? 'animate-spin' : ''}`} />
                <span>Refresh HT Games</span>
              </button>

              {publishedHtHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHtHistory}
                  disabled={isClearingHtHistory}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 font-medium text-xs px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Clear history to allow reposting of half-time scores"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isClearingHtHistory ? 'Clearing...' : 'Clear HT History'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Post Preview Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/60">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Facebook Post Preview: Half-Time Scores
                </h4>
                <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-mono">
                  {htMatchCount} Matches Included
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  id="deepseek-gen-ht-btn"
                  onClick={handleGenerateAiHt}
                  disabled={isGeneratingAiHt || htMatchCount === 0}
                  className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold px-2.5 py-1 rounded transition-colors flex items-center space-x-1.5 shadow-sm border border-blue-400/30 cursor-pointer disabled:cursor-not-allowed"
                  title="Generate a natural, human-written half-time headline & halftime analysis hook using DeepSeek AI"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAiHt ? 'animate-spin text-amber-300' : 'text-amber-400'}`} />
                  <span>{isGeneratingAiHt ? 'DeepSeek Writing...' : 'Generate with DeepSeek AI'}</span>
                </button>

                <span className="text-[11px] text-slate-500 font-mono">
                  {(isEditingHtText ? customHtText : htPreview).length} chars
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingHtText(!isEditingHtText)}
                  className={`text-xs px-2.5 py-1 rounded border font-medium transition-colors cursor-pointer ${
                    isEditingHtText
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {isEditingHtText ? 'Done Editing' : 'Edit Post Text'}
                </button>
              </div>
            </div>

            {/* AI Generation Metadata Banner */}
            {aiHtMeta && (
              <div className="flex items-center justify-between px-4 py-2 bg-blue-950/40 border-b border-blue-500/20 text-xs">
                <div className="flex items-center space-x-2 text-blue-300">
                  <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-semibold text-white">Headline: "{aiHtMeta.headline}"</span>
                </div>
                {aiHtMeta.latencyMs && (
                  <span className="text-[10px] text-blue-400/80 font-mono">
                    ⚡ DeepSeek · {aiHtMeta.latencyMs}ms
                  </span>
                )}
              </div>
            )}

            <div className="p-5 space-y-4">
              {isEditingHtText ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Customized Half-Time Content:</label>
                  <textarea
                    rows={12}
                    value={customHtText}
                    onChange={(e) => setCustomHtText(e.target.value)}
                    className="w-full bg-slate-950 border border-blue-500/40 rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-blue-400 shadow-inner"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>You can edit this post content before sending to Facebook.</span>
                    <button
                      type="button"
                      onClick={() => setCustomHtText(htPreview)}
                      className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                    >
                      Reset to generated template
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto selection:bg-blue-500/30">
                  {isLoadingHtPreview ? (
                    <div className="flex items-center justify-center py-8 space-x-2 text-slate-500">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                      <span>Generating Half-Time scores preview...</span>
                    </div>
                  ) : htPreview ? (
                    htPreview
                  ) : (
                    <div className="py-8 text-center text-slate-500 italic">
                      No matches currently at Half-Time in your selected leagues.
                      <p className="text-[11px] text-slate-600 mt-1 not-italic">
                        When matches enter half-time (HT), they will be automatically grouped here.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  Publishes all {htMatchCount} match score(s) currently at half-time in a consolidated post with cards and corner stats.
                </div>

                <button
                  type="button"
                  id="publish-halftime-now-btn"
                  onClick={handlePublishHt}
                  disabled={isPublishingHt || htMatchCount === 0 || (!htPreview && !customHtText)}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-blue-950/40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isPublishingHt ? 'Publishing Half-Time Games...' : 'Post All Half-Time Games Now'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Matches Currently at Half-Time List */}
          {htMatches.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Matches at Half-Time ({htMatches.length})</span>
                </h4>
                <span className="text-[10px] text-slate-500">
                  Intermission breakdown with corner & card tallies
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {htMatches.map((m) => {
                  const events = m.events || [];
                  const cornersH = m.stats?.cornersHome ?? events.filter(e => e.teamSide === 'home' && e.type === 'CORNER').length;
                  const cornersA = m.stats?.cornersAway ?? events.filter(e => e.teamSide === 'away' && e.type === 'CORNER').length;
                  const yellowH = m.stats?.yellowCardsHome ?? events.filter(e => e.teamSide === 'home' && e.type === 'YELLOW_CARD').length;
                  const yellowA = m.stats?.yellowCardsAway ?? events.filter(e => e.teamSide === 'away' && e.type === 'YELLOW_CARD').length;
                  const redH = m.stats?.redCardsHome ?? events.filter(e => e.teamSide === 'home' && (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD')).length;
                  const redA = m.stats?.redCardsAway ?? events.filter(e => e.teamSide === 'away' && (e.type === 'RED_CARD' || e.type === 'YELLOW_RED_CARD')).length;

                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate pr-2 font-medium text-slate-300">
                          {m.league.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold shrink-0">
                          ⏸️ HT
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-semibold text-xs text-white">
                        <span className="truncate pr-2">{m.homeTeam.name}</span>
                        <span className="font-mono text-blue-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-sm">
                          {m.homeScore} - {m.awayScore}
                        </span>
                        <span className="truncate pl-2 text-right">{m.awayTeam.name}</span>
                      </div>

                      {/* Stats Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 flex items-center space-x-1">
                          <span>🚩 Corners:</span>
                          <strong className="text-white font-mono">{cornersH} - {cornersA}</strong>
                        </span>

                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center space-x-1">
                          <span>🟨 Cards:</span>
                          <strong className="text-amber-200 font-mono">{yellowH} - {yellowA}</strong>
                        </span>

                        {(redH > 0 || redA > 0) && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center space-x-1 font-bold">
                            <span>🟥 Red:</span>
                            <strong className="text-rose-200 font-mono">{redH} - {redA}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Published Half-Time History Registry */}
          {publishedHtHistory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Published Half-Time Registry ({publishedHtHistory.length})
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500">
                  Matches that have already had their half-time scores posted
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-[10px] uppercase text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Match Teams</th>
                      <th className="p-2.5">League</th>
                      <th className="p-2.5 text-center">Score at HT</th>
                      <th className="p-2.5 text-right">Published At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {publishedHtHistory.slice(0, 30).map((r, i) => (
                      <tr key={`${r.matchId}_${i}`} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-medium text-white">
                          {r.homeTeam} vs {r.awayTeam}
                        </td>
                        <td className="p-2.5 text-slate-400">{r.leagueName || 'League'}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-blue-400">
                          {r.score}
                        </td>
                        <td className="p-2.5 text-right font-mono text-[11px] text-slate-500">
                          {new Date(r.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBSECTION: Grouped Full-Time Results with Anti-Duplicate Protection */}
      {activeSubSection === 'results' && (
        <div className="space-y-6">
          {/* Anti-Duplicate Guarantee Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Grouped Full-Time Results & Anti-Duplicate Protection
                  </h3>
                  <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                    Zero Duplicate Team Results
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  All completed matches are <strong>consolidated and grouped by league into a single Facebook post</strong>.
                  The system maintains a persistent registry of published team results: once a match result between two teams is published, it will <strong>never be repeatedly posted</strong> in subsequent roundups.
                </p>
                <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                  <div className="flex items-center space-x-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Grouped by League</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-amber-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>No Repeated Team Results</span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-indigo-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Meta Velocity Filter Safe (No Spam)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Date Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  New Results Ready to Post
                </p>
                <p className={`text-xl font-mono font-bold mt-0.5 ${resultsMatchCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {resultsMatchCount} Matches
                </p>
              </div>
              <div className={`p-2 rounded-lg border ${resultsMatchCount > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                <Flag className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Already Published Today
                </p>
                <p className="text-xl font-mono font-bold text-amber-400 mt-0.5">
                  {resultsAlreadyPublishedCount} Matches
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Total Completed Today
                </p>
                <p className="text-xl font-mono font-bold text-white mt-0.5">
                  {resultsTotalFinished} Matches
                </p>
              </div>
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Layers className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter & Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 font-medium mr-1 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Date:</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setResultsDateOffset(0);
                  fetchResultsPreview(0, filterPublishedFt);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  resultsDateOffset === 0
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Today's Results
              </button>
              <button
                type="button"
                onClick={() => {
                  setResultsDateOffset(-1);
                  fetchResultsPreview(-1, filterPublishedFt);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  resultsDateOffset === -1
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Yesterday's Results
              </button>

              <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

              {/* Anti-Duplicate filter toggle */}
              <label className="flex items-center space-x-2 cursor-pointer bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={filterPublishedFt}
                  onChange={(e) => {
                    setFilterPublishedFt(e.target.checked);
                    fetchResultsPreview(resultsDateOffset, e.target.checked);
                  }}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-slate-200 font-semibold flex items-center space-x-1">
                  <span>🛡️ Exclude Already-Published Teams</span>
                </span>
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  fetchResultsPreview();
                  fetchPublishedFtHistory();
                }}
                disabled={isLoadingResultsPreview}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors flex items-center space-x-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingResultsPreview ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleMarkCurrentAsPublished}
                disabled={isMarkingCurrentAsPublished || resultsTotalFinished === 0}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors flex items-center space-x-1.5 text-[11px]"
                title="Mark all current finished matches as published so they will not be posted"
              >
                <span>Mark All as Published</span>
              </button>

              {publishedFtHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearFtHistory}
                  disabled={isClearingFtHistory}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 font-medium transition-colors flex items-center space-x-1 text-[11px]"
                  title="Clear published history to allow reposting"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear History</span>
                </button>
              )}
            </div>
          </div>

          {/* Grouped Results Post Preview & Publisher */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Facebook Post Preview ({resultsMatchCount} Matches Included)
                </h4>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  (config.roundupFormat || 'default') === 'default'
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                }`}>
                  {(config.roundupFormat || 'default') === 'default' ? 'Standard Layout' : 'Emoji Scoreboard'}
                </span>
                {filterPublishedFt && resultsAlreadyPublishedCount > 0 && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                    {resultsAlreadyPublishedCount} duplicates excluded
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  id="deepseek-gen-ft-btn"
                  onClick={handleGenerateAiResults}
                  disabled={isGeneratingAiResults || resultsMatchCount === 0}
                  className="text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold px-2.5 py-1 rounded transition-colors flex items-center space-x-1.5 shadow-sm border border-amber-400/30 cursor-pointer disabled:cursor-not-allowed"
                  title="Generate a natural, human-written full-time headline & matchday recap using DeepSeek AI"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAiResults ? 'animate-spin text-amber-200' : 'text-amber-200'}`} />
                  <span>{isGeneratingAiResults ? 'DeepSeek Writing...' : 'Generate with DeepSeek AI'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsEditingResultsText(!isEditingResultsText);
                    if (isEditingResultsText) {
                      fetchResultsPreview();
                    }
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer"
                >
                  {isEditingResultsText ? 'Revert to Auto-Generated' : 'Edit Text Before Posting'}
                </button>
              </div>
            </div>

            {/* AI Generation Metadata Banner */}
            {aiResultsMeta && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs">
                <div className="flex items-center space-x-2 text-amber-300">
                  <Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-white">Headline: "{aiResultsMeta.headline}"</span>
                </div>
                {aiResultsMeta.latencyMs && (
                  <span className="text-[10px] text-amber-400/80 font-mono">
                    ⚡ DeepSeek · {aiResultsMeta.latencyMs}ms
                  </span>
                )}
              </div>
            )}

            {/* Post text box */}
            <div>
              {isEditingResultsText ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Customized Full-Time Results Content:</label>
                  <textarea
                    rows={10}
                    value={customResultsText}
                    onChange={(e) => setCustomResultsText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                  />
                </div>
              ) : (
                <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed shadow-inner">
                  {resultsPreview || (
                    <span className="text-slate-500 italic">
                      {resultsAlreadyPublishedCount > 0 && filterPublishedFt
                        ? `All ${resultsAlreadyPublishedCount} completed match result(s) for these teams have already been published. To prevent repeating team results, no matches are staged.`
                        : 'No completed match results found for this date. As games reach full time, this preview will automatically group them by league.'}
                    </span>
                  )}
                </pre>
              )}
            </div>

            {/* Post Action Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                {resultsMatchCount > 0 ? (
                  <span>
                    Groups all <strong>{resultsMatchCount}</strong> new full-time result(s) into <strong>1 single post</strong>. Published teams are recorded so they won't repeat.
                  </span>
                ) : (
                  <span className="text-amber-400/90 font-medium">
                    🛡️ No new unpublished results to post. Team results will not be repeated.
                  </span>
                )}
              </div>

              <button
                type="button"
                id="publish-results-now-btn"
                onClick={handlePublishResults}
                disabled={isPublishingResults || resultsMatchCount === 0 || (!resultsPreview && !customResultsText)}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-amber-950/40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isPublishingResults
                    ? 'Publishing Grouped Results...'
                    : `Publish ${resultsMatchCount} Full-Time Result(s) in 1 Post Now`}
                </span>
              </button>
            </div>
          </div>

          {/* Grouped Matches List Breakdown */}
          {resultsMatches.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Flag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Matches in this Grouping ({resultsMatches.length})</span>
                </h4>
                <span className="text-[11px] text-slate-400">
                  Showing final scores and statistics
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resultsMatches.map((m) => {
                  const stats = m.stats || {};
                  const cornersH = stats.cornersHome ?? 0;
                  const cornersA = stats.cornersAway ?? 0;
                  const yellowH = stats.yellowCardsHome ?? 0;
                  const yellowA = stats.yellowCardsAway ?? 0;
                  const redH = stats.redCardsHome ?? 0;
                  const redA = stats.redCardsAway ?? 0;

                  return (
                    <div
                      key={m.id}
                      className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-300 truncate max-w-[180px]">
                          🏆 {m.league?.name || 'League'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-bold text-[11px]">
                          🏁 FT
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-semibold text-xs text-white">
                        <span className="truncate pr-2">{m.homeTeam.name}</span>
                        <span className="font-mono text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-sm">
                          {m.homeScore} - {m.awayScore}
                        </span>
                        <span className="truncate pl-2 text-right">{m.awayTeam.name}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/60 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 flex items-center space-x-1">
                          <span>🚩 Corners:</span>
                          <strong className="text-white font-mono">{cornersH} - {cornersA}</strong>
                        </span>

                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center space-x-1">
                          <span>🟨 Cards:</span>
                          <strong className="text-amber-200 font-mono">{yellowH} - {yellowA}</strong>
                        </span>

                        {(redH > 0 || redA > 0) && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center space-x-1 font-bold">
                            <span>🟥 Red:</span>
                            <strong className="text-rose-200 font-mono">{redH} - {redA}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Published Teams History Registry */}
          {publishedFtHistory.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Published Team Results Registry ({publishedFtHistory.length} Teams Protected)
                  </h4>
                </div>
                <span className="text-[11px] text-slate-400">
                  Guarantees no repeated posts for these team matches
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {publishedFtHistory.map((item) => (
                  <div
                    key={item.teamKey}
                    className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-emerald-400">✓</span>
                      <span className="font-semibold text-white truncate">
                        {item.homeTeam} {item.score} {item.awayTeam}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({item.teamKey})
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 shrink-0 font-mono">
                      {new Date(item.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {activeSubSection === 'history' && (
        <div className="space-y-5">
          {/* Quick Manual Post Composer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-200 mb-2 flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Instant Test & Manual Publisher</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a custom score update or announcement to publish to Facebook..."
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                id="manual-post-btn"
                onClick={handleManualPost}
                disabled={isManualPosting || !manualMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 transition-all shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isManualPosting ? 'Posting...' : 'Publish'}</span>
              </button>
            </div>
          </div>

          {/* Posts History Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Event Dispatch & Post Logs
                </h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono font-semibold">
                  {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {refreshNotice && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center space-x-1 animate-fade-in bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{refreshNotice}</span>
                  </span>
                )}

                {posts.some((p) => p.status === 'SKIPPED' || p.status === 'FAILED') && (
                  <button
                    id="retry-all-skipped-btn"
                    onClick={handleRetryAllSkipped}
                    disabled={isRetryingAll}
                    className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-md flex items-center space-x-1.5 transition-colors font-medium"
                    title="Retry all skipped or failed posts with current Facebook token"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRetryingAll ? 'animate-spin' : ''}`} />
                    <span>{isRetryingAll ? 'Re-publishing...' : 'Re-publish Skipped'}</span>
                  </button>
                )}

                {posts.length > 0 && (
                  isConfirmingClear ? (
                    <div className="flex items-center space-x-1.5 bg-rose-950/60 border border-rose-700/60 rounded-md px-2 py-0.5 animate-fade-in shadow-sm">
                      <span className="text-[11px] text-rose-300 font-medium whitespace-nowrap">
                        Delete {posts.length} {posts.length === 1 ? 'log' : 'logs'}?
                      </span>
                      <button
                        id="confirm-delete-logs-btn"
                        onClick={handleClearLogs}
                        disabled={isClearingLogs}
                        className="text-[11px] bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:bg-slate-700 text-white font-bold px-2 py-0.5 rounded transition-colors cursor-pointer"
                      >
                        {isClearingLogs ? 'Clearing...' : 'Yes, Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingClear(false)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 px-1 py-0.5 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      id="clear-posts-logs-btn"
                      onClick={() => setIsConfirmingClear(true)}
                      disabled={isClearingLogs}
                      className="text-[11px] text-slate-400 hover:text-rose-300 bg-slate-800 hover:bg-rose-950/40 px-2.5 py-1 rounded-md border border-slate-700/60 hover:border-rose-800/60 flex items-center space-x-1 transition-colors cursor-pointer"
                      title="Clear post history logs"
                    >
                      <Trash2 className="w-3 h-3 text-slate-400 group-hover:text-rose-300" />
                      <span>Clear</span>
                    </button>
                  )
                )}

                <button
                  id="refresh-posts-logs-btn"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="text-[11px] text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-600 px-3 py-1 rounded-md border border-slate-700 flex items-center space-x-1.5 transition-all shadow-sm"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>
            </div>

            {posts.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs">
                No Facebook posts dispatched yet. Posts will appear here automatically as live events happen.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 overflow-x-auto">
                {posts.map((p) => {
                  const isPublished = p.status === 'PUBLISHED';
                  const isQueued = p.status === 'QUEUED';
                  const isFailed = p.status === 'FAILED';
                  const isSkipped = p.status === 'SKIPPED';

                  return (
                    <div key={p.id} className="p-4 hover:bg-slate-800/30 transition-colors text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              isPublished
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : isQueued
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : isFailed
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {p.status}
                          </span>

                          <span className="font-bold text-white">{p.matchTitle}</span>
                          {p.matchId?.startsWith('roundup_') && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                              <Layers className="w-2.5 h-2.5" />
                              <span>ALL-GAMES SCOREBOARD</span>
                            </span>
                          )}
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400">{p.leagueName}</span>
                          <span className="text-slate-500">•</span>
                          {p.eventType === 'YELLOW_CARD' ? (
                            <span className="text-amber-300 font-bold text-[11px]">🟨 YELLOW CARD</span>
                          ) : p.eventType === 'RED_CARD' ? (
                            <span className="text-rose-400 font-bold text-[11px]">🟥 RED CARD</span>
                          ) : p.eventType === 'CORNER' ? (
                            <span className="text-sky-300 font-bold text-[11px]">🚩 CORNER</span>
                          ) : p.eventType === 'GOAL' ? (
                            <span className="text-emerald-400 font-bold text-[11px]">⚽ GOAL</span>
                          ) : (
                            <span className="font-mono text-indigo-400">{p.eventType}</span>
                          )}
                        </div>

                        {/* Message Preview */}
                        <p className="text-slate-300 font-mono text-[11px] whitespace-pre-wrap bg-slate-950/70 p-2 rounded border border-slate-800/80">
                          {p.message}
                        </p>

                        {/* Error info if any */}
                        {p.error && (
                          <div
                            className={`px-2.5 py-1.5 rounded text-[11px] font-mono leading-relaxed ${
                              p.error.includes('1390008') || p.error.includes('spam') || p.error.includes('limit how often') || p.error.includes('Throttled')
                                ? 'bg-amber-950/40 border border-amber-600/40 text-amber-300'
                                : 'bg-rose-950/40 border border-rose-600/40 text-rose-300'
                            }`}
                          >
                            <span className="font-bold">
                              {p.error.includes('1390008') || p.error.includes('spam') || p.error.includes('limit how often')
                                ? '⚠️ Anti-Spam Velocity Limit: '
                                : 'Error: '}
                            </span>
                            <span>{p.error}</span>
                          </div>
                        )}
                      </div>

                      {/* Timestamp & Meta ID */}
                      <div className="sm:text-right shrink-0 space-y-1.5 text-[11px] text-slate-500">
                        <div>{new Date(p.createdAt).toLocaleTimeString()}</div>
                        {p.fbPostId && (
                          <div className="flex flex-col sm:items-end gap-1">
                            <span className="text-[10px] font-mono text-slate-400">
                              ID: {p.fbPostId.slice(0, 16)}...
                            </span>
                            <a
                              href={`https://www.facebook.com/${p.fbPostId}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 font-semibold text-[10px] border border-indigo-500/20 transition-colors"
                            >
                              <span>View on Facebook</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                        {(p.status === 'SKIPPED' || p.status === 'FAILED') && (
                          <div className="pt-1">
                            <button
                              onClick={() => handleRetrySinglePost(p.id)}
                              disabled={retryingPostId === p.id}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-[11px] transition-colors"
                            >
                              <RefreshCw className={`w-3 h-3 ${retryingPostId === p.id ? 'animate-spin' : ''}`} />
                              <span>{retryingPostId === p.id ? 'Retrying...' : 'Retry Post'}</span>
                            </button>
                          </div>
                        )}
                        {p.retryCount > 0 && <div>Retries: {p.retryCount}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Facebook Post Visibility Troubleshooting */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2 text-slate-300">
            <h4 className="font-semibold text-slate-200 flex items-center space-x-1.5">
              <span>💡 Don't see posts on your Facebook Page feed?</span>
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400 leading-relaxed">
              <li>
                <strong className="text-slate-300">App in Development Mode:</strong> Because your Meta App is currently in Development Mode, posts published via API are <span className="text-amber-400 font-medium">only visible to App Admins/Testers</span>. Public visitors or logged-out users will not see them until your app goes Live.
              </li>
              <li>
                <strong className="text-slate-300">Switch into your Page Profile:</strong> On Facebook, click your profile avatar in the top-right corner and select <strong className="text-slate-200">"Switch to GameScores"</strong>. In the modern Page Experience, posts may not appear in the personal feed.
              </li>
              <li>
                <strong className="text-slate-300">Check Meta Business Suite:</strong> View all published API posts directly at{' '}
                <a
                  href={`https://business.facebook.com/latest/posts/published_posts?asset_id=${config?.pageId || '1136971859508742'}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-indigo-400 hover:underline inline-flex items-center space-x-0.5"
                >
                  <span>Meta Business Suite &rarr; Published Posts</span>
                  <ExternalLink className="w-2.5 h-2.5 ml-1" />
                </a>.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* SUBSECTION 2: Credentials & Rules */}
      {activeSubSection === 'settings' && config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Credentials */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Meta Graph API Credentials</span>
            </h3>
            <p className="text-xs text-slate-400">
              Configure your Facebook Page ID and Page Access Token from the Meta for Developers Portal.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Facebook Page ID</label>
                <input
                  type="text"
                  placeholder="e.g. 102938475610293"
                  value={pageIdInput}
                  onChange={(e) => {
                    isEditingPageId.current = true;
                    setPageIdInput(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Page Access Token</label>
                <input
                  type="password"
                  placeholder="EAA..."
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Action Buttons: Save Configuration & Send Test Post */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-3">
                <button
                  id="save-config-btn"
                  onClick={handleExplicitSave}
                  disabled={isSaving || !pageIdInput}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-900/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving Configuration...' : 'Save Configuration'}</span>
                </button>

                <button
                  id="send-test-post-btn"
                  onClick={handleSendTestPost}
                  disabled={isTestingPost || !pageIdInput}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-900/20 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isTestingPost ? 'Sending Test Post...' : 'Send Test Post'}</span>
                </button>

                <button
                  id="verify-fb-btn"
                  onClick={handleVerifyCredentials}
                  disabled={isVerifying || !pageIdInput}
                  className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:text-slate-500 text-slate-200 font-semibold py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                  title="Verify token and permissions with Meta Graph API"
                >
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>{isVerifying ? 'Checking...' : 'Verify'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* DeepSeek AI Sports Journalist Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Bot className="w-4 h-4 text-amber-400" />
                <span>DeepSeek AI Sports Journalist</span>
              </h3>
              <span className={`text-[11px] px-2.5 py-1 rounded-md font-medium flex items-center space-x-1.5 ${
                config.hasDeepseekKey || config.deepseekApiKey || deepseekKeyInput
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                <Cpu className="w-3.5 h-3.5" />
                <span>{config.hasDeepseekKey || config.deepseekApiKey || deepseekKeyInput ? 'AI Engine Ready' : 'API Key Required'}</span>
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Generates natural, human sportscaster headlines, context-aware subheads, and fan debate hooks across all three post types (<strong>Live</strong>, <strong>Half-Time</strong>, and <strong>Full-Time</strong>) to eliminate repetitive patterns and bypass Meta spam detection.
            </p>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <div className="text-white font-medium">Enable DeepSeek AI Generation</div>
                  <div className="text-[11px] text-slate-400">When enabled, roundup posts generate dynamic AI copy before publishing</div>
                </div>
                <input
                  type="checkbox"
                  id="toggle-deepseek-ai"
                  checked={config.useDeepseekAi ?? true}
                  onChange={(e) => handleSaveConfig({ useDeepseekAi: e.target.checked })}
                  className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  DeepSeek API Key
                  {config.hasDeepseekKey && (
                    <span className="ml-2 text-[10px] text-emerald-400 font-normal">✓ Configured in system</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showDeepseekKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={deepseekKeyInput}
                    onChange={(e) => setDeepseekKeyInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 pr-16 text-slate-100 font-mono focus:outline-none focus:border-amber-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-800"
                  >
                    {showDeepseekKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Get your key at platform.deepseek.com or define DEEPSEEK_API_KEY in .env
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">DeepSeek Model</label>
                <input
                  type="text"
                  placeholder="deepseek-chat"
                  value={deepseekModelInput}
                  onChange={(e) => setDeepseekModelInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500 text-xs"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Default: deepseek-chat (DeepSeek-V3). Ultra fast (~1s) and cost effective.
                </span>
              </div>

              {/* Action Buttons: Test DeepSeek & Save */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  id="test-deepseek-btn"
                  onClick={handleTestDeepseek}
                  disabled={isTestingDeepseek || (!deepseekKeyInput && !config.hasDeepseekKey)}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed text-xs"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isTestingDeepseek ? 'animate-spin' : ''}`} />
                  <span>{isTestingDeepseek ? 'Testing Connection...' : 'Test DeepSeek API'}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveConfig({
                      ...(deepseekKeyInput.trim() ? { deepseekApiKey: deepseekKeyInput.trim() } : {}),
                      deepseekModel: deepseekModelInput.trim() || 'deepseek-chat',
                      useDeepseekAi: config.useDeepseekAi ?? true,
                    });
                  }}
                  disabled={isSaving}
                  className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:text-slate-500 text-slate-200 font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer text-xs"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Save AI Key</span>
                </button>
              </div>

              {/* DeepSeek Test Status Result */}
              {deepseekTestResult && (
                <div className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                  deepseekTestResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}>
                  {deepseekTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">{deepseekTestResult.message}</div>
                    {deepseekTestResult.latencyMs && (
                      <div className="text-[10px] opacity-80 mt-0.5">
                        Latency: {deepseekTestResult.latencyMs}ms · DeepSeek model verified
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Event Publishing Rules */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Event Publishing Rules</span>
              </h3>
                <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md font-medium flex items-center space-x-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>All-In-One Scoreboard Mode Active</span>
                </span>
              </div>

              <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-start space-x-2.5">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white font-semibold">One-Game-At-A-Time posting removed:</strong> All active matches are grouped together into a single live scoreboard update according to your scheduled interval. Individual game spam is completely disabled to protect your Facebook Page.
                </div>
              </div>

            <div className="space-y-2.5 text-xs">
              <ToggleRow
                id="toggle-goals"
                label="⚽ Goal Events"
                desc="Includes scorer name, minute, scoreline & assists"
                checked={config.publishGoals}
                onChange={(checked) => handleSaveConfig({ publishGoals: checked })}
              />
              <ToggleRow
                id="toggle-yellowcards"
                label="🟨 Yellow Cards"
                desc="Player cautions, warnings, and bookings"
                checked={config.publishYellowCards ?? true}
                onChange={(checked) => handleSaveConfig({ publishYellowCards: checked })}
              />
              <ToggleRow
                id="toggle-redcards"
                label="🟥 Red Cards"
                desc="Direct red cards and second yellow dismissals"
                checked={config.publishRedCards}
                onChange={(checked) => handleSaveConfig({ publishRedCards: checked })}
              />
              <ToggleRow
                id="toggle-corners"
                label="🚩 Corner Kicks"
                desc="Awarded corner kick set pieces"
                checked={config.publishCorners ?? true}
                onChange={(checked) => handleSaveConfig({ publishCorners: checked })}
              />
              <ToggleRow
                id="toggle-kickoff"
                label="⚡ Match Kick-Off"
                desc="When a scheduled match begins play"
                checked={config.publishKickoff}
                onChange={(checked) => handleSaveConfig({ publishKickoff: checked })}
              />
              <ToggleRow
                id="toggle-halftime"
                label="⏸️ Half-Time Whistle"
                desc="Intermission score update"
                checked={config.publishHalfTime}
                onChange={(checked) => handleSaveConfig({ publishHalfTime: checked })}
              />
              <ToggleRow
                id="toggle-fulltime"
                label="🏁 Full-Time Whistle"
                desc="Final official score outcome"
                checked={config.publishFullTime}
                onChange={(checked) => handleSaveConfig({ publishFullTime: checked })}
              />
              <ToggleRow
                id="toggle-stats"
                label="📊 Include Match Statistics in Full-Time"
                desc="Possession %, shots on target, corners summary"
                checked={config.includeStatsInFullTime}
                onChange={(checked) => handleSaveConfig({ includeStatsInFullTime: checked })}
              />
            </div>
          </div>
        </div>
      )}

      {/* SUBSECTION 3: Templates */}
      {activeSubSection === 'templates' && config && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Customizable Post Templates</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize automated text formatting for each live event type. Use placeholder tags to inject real-time match data.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    postTemplateYellowCard: "🟨 YELLOW CARD! {player} ({team}) booked in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #YellowCard",
                    postTemplateRedCard: "🟥 RED CARD! {player} ({team}) sent off in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #RedCard",
                    postTemplateCorner: "🚩 CORNER KICK! Corner awarded to {team} in the {minute}' min!\n⏱️ Match Time: {minute}' ({period})\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #CornerKick",
                    postTemplateGoal: "⚽ GOAL! {home_team} {home_score} - {away_score} {away_team}!\n⏱️ Match Time: {minute}' min ({period})\n👤 {player}\n🏆 {league_name}\n\n#{league_tag} #LiveScores #GameScores",
                    postTemplateRoundup: "⚽ LIVE MATCHES SCOREBOARD ⏱️\n📊 {count} Active Match(es) in Progress ({time})\n\n{matches_list}\n\n⚡ Follow for live scores and breaking goal updates!\n{hashtags} #LiveScores #GameScores",
                    postTemplateFullTime: "🏁 FULL-TIME: {home_team} {home_score} - {away_score} {away_team}\n⏱️ Match Time: Full-Time (90')\n🏆 {league_name}\n{stats_summary}\n\nThanks for following!\n#{league_tag} #GameScores",
                  }))
                }
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer"
                title="Reset all templates to default layouts"
              >
                Reset Defaults
              </button>
              <button
                id="save-templates-btn"
                onClick={() =>
                  handleSaveConfig({
                    postTemplateGoal: config.postTemplateGoal,
                    postTemplateYellowCard: config.postTemplateYellowCard,
                    postTemplateRedCard: config.postTemplateRedCard,
                    postTemplateCorner: config.postTemplateCorner,
                    postTemplateKickoff: config.postTemplateKickoff,
                    postTemplateHalfTime: config.postTemplateHalfTime,
                    postTemplateFullTime: config.postTemplateFullTime,
                    postTemplateRoundup: config.postTemplateRoundup,
                    postTemplateFullTimeRoundup: config.postTemplateFullTimeRoundup,
                    postTemplateHalfTimeRoundup: config.postTemplateHalfTimeRoundup,
                  })
                }
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-md shadow-emerald-900/20 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save All Templates'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* 1. Yellow Card Template */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-amber-300 font-bold flex items-center space-x-1.5 text-xs">
                  <span>🟨</span>
                  <span>Yellow Card Template</span>
                </label>
                <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                  Tags: {'{player}'}, {'{team}'}, {'{minute}'}, {'{period}'}, {'{home_team}'}, {'{away_team}'}, {'{home_score}'}, {'{away_score}'}, {'{league_name}'}, {'{league_tag}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dispatched when a player receives a yellow card caution during a live match.
              </p>
              <textarea
                id="template-yellow-card"
                rows={4}
                placeholder="🟨 YELLOW CARD! {player} ({team}) booked in the {minute}' min!&#10;⏱️ Match Time: {minute}' ({period})&#10;{home_team} {home_score} - {away_score} {away_team}&#10;🏆 {league_name}&#10;&#10;#{league_tag} #YellowCard"
                value={config.postTemplateYellowCard || ''}
                onChange={(e) => setConfig({ ...config, postTemplateYellowCard: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* 2. Red Card Template */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-rose-400 font-bold flex items-center space-x-1.5 text-xs">
                  <span>🟥</span>
                  <span>Red Card Template</span>
                </label>
                <span className="text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded font-mono">
                  Tags: {'{player}'}, {'{team}'}, {'{minute}'}, {'{period}'}, {'{home_team}'}, {'{away_team}'}, {'{home_score}'}, {'{away_score}'}, {'{league_name}'}, {'{league_tag}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dispatched when a player is sent off via direct red card or second yellow dismissal.
              </p>
              <textarea
                id="template-red-card"
                rows={4}
                placeholder="🟥 RED CARD! {player} ({team}) sent off in the {minute}' min!&#10;⏱️ Match Time: {minute}' ({period})&#10;{home_team} {home_score} - {away_score} {away_team}&#10;🏆 {league_name}&#10;&#10;#{league_tag} #RedCard"
                value={config.postTemplateRedCard || ''}
                onChange={(e) => setConfig({ ...config, postTemplateRedCard: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* 3. Corner Kick Template */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-sky-300 font-bold flex items-center space-x-1.5 text-xs">
                  <span>🚩</span>
                  <span>Corner Kick Template</span>
                </label>
                <span className="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/20 px-2 py-0.5 rounded font-mono">
                  Tags: {'{team}'}, {'{minute}'}, {'{period}'}, {'{corner_count}'}, {'{home_team}'}, {'{away_team}'}, {'{home_score}'}, {'{away_score}'}, {'{league_name}'}, {'{league_tag}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dispatched when a corner kick is awarded to an attacking side.
              </p>
              <textarea
                id="template-corner"
                rows={4}
                placeholder="🚩 CORNER KICK! Corner awarded to {team} in the {minute}' min!&#10;⏱️ Match Time: {minute}' ({period})&#10;{home_team} {home_score} - {away_score} {away_team}&#10;🏆 {league_name}&#10;&#10;#{league_tag} #CornerKick"
                value={config.postTemplateCorner || ''}
                onChange={(e) => setConfig({ ...config, postTemplateCorner: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* 4. Goal Template */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-emerald-300 font-bold flex items-center space-x-1.5 text-xs">
                  <span>⚽</span>
                  <span>Goal Event Template</span>
                </label>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                  Tags: {'{home_team}'}, {'{away_team}'}, {'{home_score}'}, {'{away_score}'}, {'{player}'}, {'{minute}'}, {'{period}'}, {'{league_name}'}, {'{league_tag}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dispatched each time a live goal is scored.
              </p>
              <textarea
                id="template-goal"
                rows={4}
                value={config.postTemplateGoal}
                onChange={(e) => setConfig({ ...config, postTemplateGoal: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* 5. Scoreboard Roundup Template */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-indigo-300 font-bold flex items-center space-x-1.5 text-xs">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>All Games in 1 Post Template (Scoreboard Roundup)</span>
                </label>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                  Tags: {'{headline}'}, {'{subhead}'}, {'{matches_list}'}, {'{closing}'}, {'{hashtags}'}, {'{count}'}, {'{time}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Format applied when active live games are compiled into a consolidated scoreboard post. Leave empty to use the <strong>Dynamic Anti-Spam Engine</strong>, which automatically rotates headlines, subheads, natural closings, and smart league hashtags to prevent Meta repetitive content flags.
              </p>
              <textarea
                id="template-roundup"
                rows={5}
                placeholder="{headline}&#10;{subhead}&#10;&#10;{matches_list}&#10;&#10;{closing}&#10;{hashtags}"
                value={config.postTemplateRoundup || ''}
                onChange={(e) => setConfig({ ...config, postTemplateRoundup: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* 6. Full-Time Whistle Template */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-slate-200 font-bold flex items-center space-x-1.5 text-xs">
                  <span>🏁</span>
                  <span>Full-Time Whistle Template</span>
                </label>
                <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono">
                  Tags: {'{home_team}'}, {'{away_team}'}, {'{home_score}'}, {'{away_score}'}, {'{league_name}'}, {'{stats_summary}'}, {'{league_tag}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dispatched upon final match completion, with optional possession and shot statistics.
              </p>
              <textarea
                id="template-fulltime"
                rows={4}
                value={config.postTemplateFullTime}
                onChange={(e) => setConfig({ ...config, postTemplateFullTime: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-slate-500"
              />
            </div>

            {/* 8. Half-Time Roundup Template (All HT Games in 1 Post) */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="text-blue-400 font-bold flex items-center space-x-1.5 text-xs">
                  <span>⏸️</span>
                  <span>Half-Time Roundup Template (All HT Games in 1 Post)</span>
                </label>
                <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                  Tags: {'{count}'}, {'{time}'}, {'{matches_list}'}, {'{hashtags}'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Template used when consolidating all current half-time games into a single grouped post.
              </p>
              <textarea
                id="template-halftime-roundup"
                rows={4}
                placeholder="⏸️ HALF-TIME SCORES ROUNDUP ⏱️&#10;📊 {count} Match(es) at Half-Time ({time})&#10;&#10;{matches_list}&#10;&#10;⚡ Stay tuned for the second half!&#10;{hashtags} #HalfTime #LiveScores"
                value={config.postTemplateHalfTimeRoundup || ''}
                onChange={(e) => setConfig({ ...config, postTemplateHalfTimeRoundup: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ToggleRow({
  id,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800">
      <div>
        <span className="font-semibold text-slate-200">{label}</span>
        <p className="text-[11px] text-slate-500">{desc}</p>
      </div>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
      />
    </div>
  );
}
