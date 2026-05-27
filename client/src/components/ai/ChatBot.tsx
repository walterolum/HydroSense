import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Bot, User, Loader2, Sparkles, ChevronDown,
  ImagePlus, AlertCircle, Plus, MessageSquare, Trash2, History,
  RefreshCw, Clock, Activity, Copy, CheckCircle2, Moon, Sun,
  Lightbulb, MessageCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAIService } from '../../contexts/AIServiceContext';
import { sendChatMessage, sendChatMessageStream, getNetworkQuality } from '../../api/aiClient';
import {
  getAIConversations, createAIConversation, getAIConversation,
  deleteAIConversation, addAIMessage,
} from '../../api/client';
import { getUserAISuggestions } from '../../api/aiClient';
import type { AIConversation } from '../../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: string;
  imagePreview?: string;
  isStreaming?: boolean;
  isError?: boolean;
}

const SUGGESTIONS: Record<string, string[]> = {
  national_admin: [
    'Generate a national water infrastructure report',
    'Which districts have the most critical alerts?',
    'Show budget allocation vs expenditure trends',
    'What are the top 5 infrastructure risks?',
  ],
  district_officer: [
    'Show my district water point status',
    'Which maintenance requests are overdue?',
    'What is the contamination risk in my district?',
    'Generate a district situation report',
  ],
  technician: [
    'Which sensors are offline right now?',
    'Show pending repairs by priority',
    'What spare parts are most needed?',
    'Guide me through pump repair steps',
  ],
  citizen: [
    'How many water points are functional?',
    'Report a broken water point',
    'Is my water safe to drink?',
    'What is the drought forecast?',
  ],
  default: [
    'How many water points are functional?',
    'Which sites need urgent maintenance?',
    'Summarise the current drought forecast',
    'Show contamination risks by district',
  ],
};

const MAX_IMAGE_MB = 10;
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';
const STREAM_TIMEOUT_MS = 60000;
const STALL_WARNING_MS = 15000;

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let messageCounter = 0;
function generateMessageId(prefix = 'msg'): string {
  messageCounter++;
  return `${prefix}_${Date.now()}_${messageCounter}`;
}

function getAIErrorDisplay(error: any): { content: string; type: string } {
  if (error?.cancelled) return { content: 'Request was cancelled.', type: 'cancelled' };
  if (error?.timeout) return { content: 'AI response is taking longer than expected. Try again.', type: 'timeout' };
  if (error?.rateLimit) return { content: 'AI is busy processing other requests. Please wait.', type: 'rate_limit' };
  if (error?.network) return { content: 'Unable to reach AI services. Automatic recovery in progress.', type: 'network' };
  if (error?.serverError) return { content: `AI service temporarily unavailable (${error.status}). Recovery in progress.`, type: 'server_error' };
  return { content: 'A temporary issue occurred. Please try again.', type: 'unknown' };
}

function getSuggestionsForRole(role: string): string[] {
  return SUGGESTIONS[role] || SUGGESTIONS.default;
}

export default function ChatBot() {
  const { user } = useAuth();
  const {
    status: aiStatus, aiOnline, statusMessage,
    startRequest, updateRequest, completeRequest, failRequest,
    networkQuality,
  } = useAIService();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [sessionId] = useState(() => generateSessionId());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    id: '0',
    role: 'assistant',
    content: `Hello${user ? `, ${user.name.split(' ')[0]}` : ''}! I'm **Hydro AI**, your intelligent HYDROSENSE assistant.\n\nI can help with water points, alerts, predictions, climate data, image analysis, and general questions. How can I assist you today?`,
    timestamp: new Date(),
    source: 'Hydro AI v5.0',
  }]);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string>('');
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamStalled, setStreamStalled] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const retryDataRef = useRef<{ text: string; capturedBase64: string | null; capturedMime: string; capturedPreview: string | null } | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  const userRole = user?.role || 'citizen';
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const suggestions = dynamicSuggestions.length > 0 ? dynamicSuggestions : getSuggestionsForRole(userRole);
  const showInitialSuggestions = messages.filter(m => m.role === 'assistant' && !m.isError).length <= 1;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
      fetchConversations();
      if (user?.id) {
        getUserAISuggestions(user.id).then(s => {
          if (s.suggestions.length > 0 && mountedRef.current) {
            setDynamicSuggestions(s.suggestions);
          }
        }).catch(() => {});
      }
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingContent]);

  useEffect(() => {
    if (loading) {
      const start = Date.now();
      elapsedIntervalRef.current = setInterval(() => { setElapsed(Math.floor((Date.now() - start) / 1000)); }, 1000);
    } else {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      setElapsed(0);
    }
    return () => { if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current); };
  }, [loading]);

  const clearStallTimer = () => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    setStreamStalled(false);
  };

  const fetchConversations = async () => {
    try {
      const res = await getAIConversations({ limit: 20 });
      if (mountedRef.current) setConversations(res.data.data || []);
    } catch {}
  };

  const handleNewChat = async () => {
    try {
      const res = await createAIConversation({ title: 'New Chat', category: 'general' });
      const id = res.data.data.id;
      if (!mountedRef.current) return;
      setConversations(prev => [{
        id, title: 'New Chat', category: 'general',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        role: user?.role || 'citizen', is_multi_user: 0, status: 'active',
      } as AIConversation, ...prev]);
      setActiveConvId(id);
      setMessages([{ id: '0', role: 'assistant', content: 'New conversation started. How can Hydro AI help you today?', timestamp: new Date(), source: 'Hydro AI v5.0' }]);
      setShowSidebar(false);
    } catch {}
  };

  const handleSelectConversation = async (id: number) => {
    setActiveConvId(id);
    setShowSidebar(false);
    try {
      const res = await getAIConversation(id);
      const msgs = res.data.data?.messages || [];
      if (!mountedRef.current) return;
      if (msgs.length > 0) {
        setMessages(msgs.map((m: any) => ({
          id: m.id.toString(),
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at),
        })));
      } else {
        setMessages([{ id: '0', role: 'assistant', content: 'Continue your conversation. How can Hydro AI help?', timestamp: new Date(), source: 'Hydro AI v5.0' }]);
      }
    } catch {
      if (mountedRef.current) {
        setMessages([{ id: '0', role: 'assistant', content: 'Continue your conversation. How can Hydro AI help?', timestamp: new Date(), source: 'Hydro AI v5.0' }]);
      }
    }
  };

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAIConversation(id);
      if (!mountedRef.current) return;
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([{ id: '0', role: 'assistant', content: `Hello${user ? `, ${user.name.split(' ')[0]}` : ''}! I'm **Hydro AI**, your intelligent HYDROSENSE assistant.`, timestamp: new Date(), source: 'Hydro AI v5.0' }]);
      }
    } catch {}
  };

  const clearImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    setImageError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const processFile = useCallback((file: File) => {
    setImageError('');
    if (!file.type.startsWith('image/')) {
      setImageError('Only image files are supported.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setImageError(`Image must be under ${MAX_IMAGE_MB} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      const b64 = dataUrl.split(',')[1];
      if (mountedRef.current) {
        setImageBase64(b64);
        setImageMime(file.type);
        setImagePreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) processFile(file);
    }
  };

  const saveMessagesToConversation = async (convId: number, userMsg: string, reply: string, tokens?: number) => {
    try {
      await addAIMessage(convId, { role: 'user', content: userMsg || 'Image analysis request', content_type: 'text' });
      await addAIMessage(convId, { role: 'assistant', content: reply || '', content_type: 'text', tokens_used: tokens });
    } catch {}
  };

  const addErrorMessage = (content: string, type: string) => {
    setMessages(prev => {
      if (prev[prev.length - 1]?.isError && prev[prev.length - 1]?.content === content) return prev;
      return [...prev, { id: generateMessageId('err'), role: 'assistant', content, timestamp: new Date(), source: `Hydro AI - ${type}`, isError: true }];
    });
  };

  const clearRetryState = () => {
    retryDataRef.current = null;
    setRetryMessage(null);
    clearStallTimer();
  };

  const copyToClipboard = async (text: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => { if (mountedRef.current) setCopiedId(null); }, 2000);
    } catch {}
  };

  const executeSend = async (
    text: string,
    capturedBase64: string | null,
    capturedMime: string,
    capturedPreview: string | null,
  ) => {
    setLoading(true);
    clearRetryState();

    const hasImage = !!capturedBase64;
    const reqId = startRequest(text || (hasImage ? 'Image analysis' : ''));
    setCurrentRequestId(reqId);

    const history = messages
      .filter(m => !m.isError && !m.isStreaming)
      .slice(-8)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);

    try {
      updateRequest(reqId, 'processing');

      if (getNetworkQuality() === 'poor') {
        const res = await sendChatMessage(
          text, history, user?.role || 'citizen', user?.district,
          capturedBase64 || undefined, capturedMime || undefined, activeConvId || undefined,
          sessionId,
        );
        clearTimeout(timeout);
        if (!mountedRef.current) return;

        updateRequest(reqId, 'responding');
        const d = res.data;
        const reply = d.reply || 'I was unable to process your request.';
        const source = d.analyzed_image ? `${d.model} - Image Analysis` : (d.model || 'Hydro AI');

        setMessages(prev => [...prev, {
          id: generateMessageId('ai'), role: 'assistant', content: reply,
          timestamp: new Date(), source,
        }]);
        if (activeConvId) saveMessagesToConversation(activeConvId, text, reply, d.tokens_used);
        completeRequest(reqId);
        clearImage();
      } else {
        const streamId = `stream_${Date.now()}`;
        setMessages(prev => [...prev, {
          id: streamId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, source: 'Hydro AI v5.0',
        }]);

        const stallTimer = setTimeout(() => {
          if (mountedRef.current) setStreamStalled(true);
        }, STALL_WARNING_MS);
        stallTimerRef.current = stallTimer;

        let fallbackAttempted = false;

        await sendChatMessageStream(
          text, history, user?.role || 'citizen', user?.district,
          capturedBase64 || undefined, capturedMime || undefined, activeConvId || undefined,
          sessionId,
          (chunk) => {
            clearTimeout(stallTimer);
            stallTimerRef.current = setTimeout(() => {
              if (mountedRef.current) setStreamStalled(true);
            }, STALL_WARNING_MS);
            setStreamingContent(prev => prev + chunk);
          },
          (fullText) => {
            clearTimeout(timeout);
            clearTimeout(stallTimer);
            if (!mountedRef.current) return;
            setMessages(prev => prev.map(m =>
              m.id === streamId ? { ...m, content: fullText || '', isStreaming: false } : m
            ));
            setStreamingContent('');
            updateRequest(reqId, 'responding');
            if (activeConvId) saveMessagesToConversation(activeConvId, text, fullText || '');
            completeRequest(reqId);
            clearImage();
          },
          async (error) => {
            if (fallbackAttempted) return;
            fallbackAttempted = true;
            clearTimeout(timeout);
            clearTimeout(stallTimer);
            if (!mountedRef.current) return;
            setMessages(prev => prev.filter(m => m.id !== streamId));

            try {
              const res = await sendChatMessage(
                text, history, user?.role || 'citizen', user?.district,
                capturedBase64 || undefined, capturedMime || undefined, activeConvId || undefined,
                sessionId,
              );
              clearTimeout(timeout);
              if (!mountedRef.current) return;
              updateRequest(reqId, 'responding');
              const d = res.data;
              const reply = d.reply || 'I was unable to process your request.';
              const source = d.analyzed_image ? `${d.model} - Image Analysis` : (d.model || 'Hydro AI');
              setMessages(prev => [...prev, {
                id: generateMessageId('ai'), role: 'assistant', content: reply,
                timestamp: new Date(), source,
              }]);
              if (activeConvId) saveMessagesToConversation(activeConvId, text, reply, d.tokens_used);
              completeRequest(reqId);
              clearImage();
            } catch (fallbackErr) {
              if (!mountedRef.current) return;
              if (fallbackErr.name === 'AbortError') {
                retryDataRef.current = { text, capturedBase64, capturedMime, capturedPreview };
                setRetryMessage('Request timed out. Tap to retry.');
                failRequest(reqId, 'timeout');
                addErrorMessage('AI response timed out. Please try again.', 'timeout');
              } else if (fallbackErr.timeout || fallbackErr.serverError || fallbackErr.network) {
                retryDataRef.current = { text, capturedBase64, capturedMime, capturedPreview };
                setRetryMessage('Connection issue. Tap to retry.');
                failRequest(reqId, fallbackErr.message);
                addErrorMessage(getAIErrorDisplay(fallbackErr).content, 'retryable');
              } else {
                failRequest(reqId, fallbackErr.message);
                addErrorMessage(getAIErrorDisplay(fallbackErr).content, 'error');
              }
            }
          },
          abortController.signal,
        );
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (!mountedRef.current) return;

      if (err.name === 'AbortError') {
        retryDataRef.current = { text, capturedBase64, capturedMime, capturedPreview };
        setRetryMessage('Request timed out. Tap to retry.');
        failRequest(reqId, 'timeout');
        addErrorMessage('AI response timed out. Please try again.', 'timeout');
      } else if (err.timeout || err.serverError || err.network) {
        retryDataRef.current = { text, capturedBase64, capturedMime, capturedPreview };
        setRetryMessage('Connection issue. Tap to retry.');
        failRequest(reqId, err.message);
        addErrorMessage(getAIErrorDisplay(err).content, 'retryable');
      } else if (!err.cancelled) {
        failRequest(reqId, err.message);
        addErrorMessage(getAIErrorDisplay(err).content, 'error');
      } else {
        failRequest(reqId, 'cancelled');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setCurrentRequestId(null);
        setStreamStalled(false);
        clearStallTimer();
        fetchConversations();
      }
    }
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if ((!msg && !imageBase64) || loading) return;

    const capturedBase64 = imageBase64;
    const capturedMime = imageMime;
    const capturedPreview = imagePreview;

    if (!capturedBase64) clearImage();
    setInput('');

    setMessages(prev => [...prev, {
      id: generateMessageId('user'), role: 'user', content: msg || 'Image uploaded for analysis',
      timestamp: new Date(), imagePreview: capturedPreview || undefined,
    }]);

    if (capturedBase64) clearImage();

    await executeSend(msg, capturedBase64, capturedMime, capturedPreview || null);
  };

  const handleRetry = async () => {
    if (!retryDataRef.current || loading) return;
    setMessages(prev => prev.filter(m => !m.isError));
    const data = retryDataRef.current;
    clearRetryState();
    await executeSend(data.text, data.capturedBase64, data.capturedMime, data.capturedPreview);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (aiOnline && !loading && retryDataRef.current) {
      const timer = setTimeout(() => {
        if (retryDataRef.current && !loadingRef.current && mountedRef.current) {
          const data = retryDataRef.current;
          clearRetryState();
          executeSend(data.text, data.capturedBase64, data.capturedMime, data.capturedPreview);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [aiOnline, loading]);

  // ── Markdown Components ──
  const MarkdownContent = ({ content }: { content: string }) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children).replace(/\n$/, '');
          if (match) {
            return (
              <div className="relative group my-2 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1 bg-gray-800 text-gray-400 text-[10px] font-mono">
                  <span>{match[1]}</span>
                  <button
                    onClick={() => copyToClipboard(codeStr, `code_${Date.now()}`)}
                    className="hover:text-white transition-colors"
                  >
                    <Copy size={11} />
                  </button>
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, fontSize: '12px', lineHeight: '1.5' }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              </div>
            );
          }
          return (
            <code className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-sm font-mono" {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="text-emerald-600 hover:text-emerald-700 underline">
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs border-collapse border border-gray-200 dark:border-gray-700">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 bg-gray-50 dark:bg-gray-800 font-medium">{children}</th>;
        },
        td({ children }) {
          return <td className="border border-gray-200 dark:border-gray-700 px-2 py-1">{children}</td>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // ── UI helpers ──
  const getOnlineDot = () => {
    if (loading) return 'bg-blue-400 animate-pulse';
    if (aiOnline) return 'bg-emerald-400';
    return 'bg-red-400';
  };

  const getStatusLabel = () => {
    if (loading) return 'Processing...';
    if (aiOnline) return statusMessage || 'Hydro AI Online';
    return 'AI Offline';
  };

  const showNetworkIndicator = networkQuality === 'poor' || networkQuality === 'offline';

  const bgClass = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-800';
  const borderClass = darkMode ? 'border-gray-700' : 'border-gray-200';
  const panelBg = darkMode ? 'bg-gray-900' : 'bg-white';
  const chatBg = darkMode ? 'bg-gray-850' : 'bg-[#fafbfc]';
  const inputBg = darkMode ? 'bg-gray-800' : 'bg-gray-50';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
        style={{ background: 'linear-gradient(135deg,#0b5e42,#1a8a5c)', boxShadow: '0 8px 32px rgba(11,94,66,0.45)' }}
        title="Hydro AI Assistant"
      >
        {open ? <X size={18} className="text-white" /> : (
          <div className="relative">
            <Sparkles size={20} className="text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-300 rounded-full" />
          </div>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.25 }}
            className={`fixed bottom-24 right-6 z-50 w-[440px] max-w-[calc(100vw-24px)] rounded-3xl shadow-2xl overflow-hidden flex flex-col ${panelBg} ${borderClass}`}
            style={{ height: 620, border: `1px solid ${darkMode ? 'rgba(75,85,99,0.3)' : 'rgba(11,94,66,0.15)'}`, boxShadow: darkMode ? '0 24px 64px rgba(0,0,0,0.5)' : '0 24px 64px rgba(0,0,0,0.18)' }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            ref={dropRef}
          >
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#064e3b,#0b5e42)' }}>
              <button onClick={() => setShowSidebar(!showSidebar)}
                className="text-white/70 hover:text-white transition-colors">
                <History size={16} />
              </button>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                {loading ? (
                  <Loader2 size={18} className="text-white animate-spin" />
                ) : (
                  <Sparkles size={18} className="text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm">Hydro AI</div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${getOnlineDot()}`} />
                  <span className="text-emerald-200 text-[11px] truncate">{getStatusLabel()}</span>
                  {showNetworkIndicator && (
                    <span className="text-amber-300 text-[10px] flex items-center gap-0.5 ml-1">
                      <Activity size={9} /> weak
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setDarkMode(!darkMode)}
                className="text-white/70 hover:text-white transition-colors p-1" title="Toggle theme">
                {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button onClick={handleNewChat} className="text-white/70 hover:text-white transition-colors p-1" title="New Chat">
                <Plus size={16} />
              </button>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
                <ChevronDown size={18} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden">
              {showSidebar && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 192, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col flex-shrink-0 overflow-hidden"
                >
                  <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                    <button onClick={handleNewChat}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors">
                      <Plus size={12} /> New Chat
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 ? (
                      <div className="p-3 text-center text-gray-400 dark:text-gray-500 text-[11px]">
                        <MessageSquare size={20} className="mx-auto mb-1 opacity-50" />
                        No conversations
                      </div>
                    ) : (
                      conversations.map(conv => (
                        <div key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className={`p-2.5 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group ${activeConvId === conv.id ? 'bg-emerald-50 dark:bg-emerald-900/30 border-l-2 border-l-emerald-500' : ''}`}>
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{conv.title}</div>
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{conv.last_message || 'No messages'}</div>
                            </div>
                            <button onClick={e => handleDeleteConversation(conv.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-opacity p-0.5">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}

              <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scroll ${chatBg}`}>
                {showInitialSuggestions && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-2 border-dashed border-emerald-200 dark:border-emerald-700 rounded-2xl p-4 text-center text-xs text-emerald-400 mb-2"
                  >
                    <ImagePlus size={20} className="mx-auto mb-1 text-emerald-300" />
                    Drag & drop, paste, or click
                    <button onClick={() => fileRef.current?.click()} className="text-emerald-600 dark:text-emerald-400 font-semibold mx-1">upload</button>
                    an image for AI analysis
                  </motion.div>
                )}

                {messages.map(m => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: m.isError ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                          : m.role === 'assistant' ? 'linear-gradient(135deg,#0b5e42,#1a8a5c)'
                          : 'linear-gradient(135deg,#0369a1,#0284c7)',
                      }}
                    >
                      {m.isError ? <AlertCircle size={13} className="text-white" /> :
                       m.role === 'assistant' ? <Bot size={13} className="text-white" /> : <User size={13} className="text-white" />}
                    </div>

                    <div
                      className={`rounded-2xl px-3.5 py-2.5 max-w-[85%] text-sm leading-relaxed ${
                        m.isError ? 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                          : m.role === 'user' ? 'text-white rounded-tr-sm'
                          : `${darkMode ? 'bg-gray-800 text-gray-100' : 'text-gray-800 bg-white'} rounded-tl-sm border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`
                      }`}
                      style={{
                        background: m.isError ? undefined : m.role === 'user' ? 'linear-gradient(135deg,#0369a1,#0284c7)' : undefined,
                        boxShadow: darkMode ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07)',
                      }}
                    >
                      {m.imagePreview && (
                        <div className="mb-2 rounded-xl overflow-hidden border border-white/20">
                          <img src={m.imagePreview} alt="Uploaded for analysis" className="w-full max-h-40 object-cover" />
                        </div>
                      )}
                      <div className={`${m.role === 'assistant' ? 'markdown-text' : ''} ${darkMode ? 'text-gray-100' : ''}`}>
                        {m.isStreaming && m.content === '' && streamingContent === '' ? (
                          <div className="flex gap-1 py-1">
                            <motion.span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} />
                            <motion.span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, delay: 0.2, repeat: Infinity }} />
                            <motion.span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, delay: 0.4, repeat: Infinity }} />
                          </div>
                        ) : m.isStreaming && streamingContent ? (
                          <div>
                            <MarkdownContent content={streamingContent} />
                            <motion.span className="inline-block w-1.5 h-4 bg-emerald-500 ml-0.5" animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />
                          </div>
                        ) : (
                          <MarkdownContent content={m.content} />
                        )}
                      </div>
                      <div className={`text-[10px] mt-1.5 flex items-center gap-2 ${
                        m.isError ? 'text-amber-600 dark:text-amber-400' : m.role === 'user' ? 'text-blue-200' : darkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}>
                        <span className="flex items-center gap-1">
                          {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {m.source && m.role === 'assistant' && !m.isStreaming && ` - ${m.source}`}
                          {m.isError && <AlertCircle size={10} />}
                          {m.isStreaming && <Clock size={10} className="animate-pulse" />}
                        </span>
                        {m.role === 'assistant' && !m.isStreaming && m.content && !m.isError && (
                          <button
                            onClick={() => copyToClipboard(m.content, m.id)}
                            className="hover:text-emerald-600 transition-colors p-0.5"
                            title="Copy response"
                          >
                            {copiedId === m.id ? <CheckCircle2 size={11} className="text-emerald-500" /> : <Copy size={11} />}
                          </button>
                        )}
                      </div>
                      {m.role === 'assistant' && !m.isStreaming && !m.isError && m.content && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Sparkles size={8} className="text-emerald-300" />
                          <span className="text-[9px] text-emerald-400">AI remembers context</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {loading && !messages.some(m => m.isStreaming) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-2.5"
                  >
                    <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center animate-pulse">
                      <Bot size={13} className="text-white" />
                    </div>
                    <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 shadow-sm min-w-[180px] ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Loader2 size={12} className="text-emerald-500 animate-spin" />
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Thinking...</span>
                        {elapsed > 5 && (
                          <span className="text-[10px] text-gray-400 ml-auto">{elapsed}s</span>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        <motion.span className="w-2 h-2 bg-emerald-400 rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} />
                        <motion.span className="w-2 h-2 bg-emerald-400 rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, delay: 0.2, repeat: Infinity }} />
                        <motion.span className="w-2 h-2 bg-emerald-400 rounded-full" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, delay: 0.4, repeat: Infinity }} />
                      </div>
                      {elapsed > 30 && (
                        <div className="mt-2 text-[10px] text-amber-600 flex items-center gap-1">
                          <AlertCircle size={10} />
                          Still working...
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {streamStalled && loading && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <div className="px-3 py-1.5 rounded-xl text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200">
                      Response is taking longer than usual...
                    </div>
                  </motion.div>
                )}

                {retryMessage && !loading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center"
                  >
                    <button onClick={handleRetry}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">
                      <RefreshCw size={12} /> {retryMessage}
                    </button>
                  </motion.div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* ── Suggestions ── */}
            {showInitialSuggestions && !loading && (
              <div className={`px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0 border-t ${borderClass} ${chatBg}`}>
                {suggestions.slice(0, 3).map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap flex-shrink-0">
                    <Lightbulb size={10} className="inline mr-1" />
                    {s.length > 30 ? s.slice(0, 30) + '...' : s}
                  </button>
                ))}
              </div>
            )}

            {/* ── Image Preview ── */}
            {imagePreview && (
              <div className={`px-4 py-2 flex-shrink-0 border-t ${borderClass} ${panelBg}`}>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-2xl">
                  <img src={imagePreview} alt="preview" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-emerald-200" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Image ready for analysis</div>
                    <div className="text-[10px] text-emerald-500 dark:text-emerald-400">Send or add a question</div>
                  </div>
                  <button onClick={clearImage} className="text-emerald-400 hover:text-red-500 transition-colors flex-shrink-0">
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {imageError && (
              <div className={`px-4 py-1.5 flex-shrink-0 ${panelBg} border-t ${borderClass}`}>
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle size={13} /> {imageError}
                  <button onClick={() => setImageError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={12} /></button>
                </div>
              </div>
            )}

            {!aiOnline && (
              <div className="px-4 py-1 flex-shrink-0 border-t bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <AlertCircle size={11} className="animate-pulse" />
                  <span>AI Service Offline — requests queued</span>
                </div>
              </div>
            )}

            {/* ── Input ── */}
            <div className={`px-3 pb-3 pt-2 flex-shrink-0 border-t ${borderClass} ${panelBg}`}>
              <div className={`flex gap-2 items-center ${inputBg} rounded-2xl border ${borderClass} px-3 py-2 focus-within:border-emerald-400 focus-within:bg-white dark:focus-within:bg-gray-800 transition-all`}>
                <button
                  type="button"
                  title="Upload image"
                  onClick={() => fileRef.current?.click()}
                  className="text-gray-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                  disabled={loading}
                >
                  <ImagePlus size={18} />
                </button>

                <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="hidden" />

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={loading ? 'Hydro AI is processing...' : imageBase64 ? 'Add a question about this image...' : 'Ask Hydro AI anything...'}
                  className={`flex-1 text-sm bg-transparent outline-none ${darkMode ? 'text-gray-100 placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
                  disabled={loading}
                />

                <button
                  onClick={() => sendMessage()}
                  disabled={(!input.trim() && !imageBase64) || loading}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 hover:scale-110 active:scale-95 flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#0b5e42,#1a8a5c)' }}
                >
                  {loading ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-white" />}
                </button>
              </div>

              <div className={`text-center text-[10px] mt-1.5 flex items-center justify-center gap-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {loading ? (
                  <span className="flex items-center gap-1"><Clock size={10} /> Processing ({elapsed}s)</span>
                ) : aiOnline ? (
                  <span className="flex items-center gap-1">
                    <Activity size={10} className="text-emerald-500" />
                    Hydro AI Online
                    {showNetworkIndicator && (
                      <span className="text-amber-500 ml-1 flex items-center gap-0.5">
                        <Activity size={9} /> {networkQuality}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Activity size={10} className="text-red-500 animate-pulse" />
                    AI Offline
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
