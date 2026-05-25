import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Plus, Trash2, MessageSquare, FileText, X,
  ChevronLeft, Bot, User, Sparkles, Paperclip, Loader2,
  Wifi, WifiOff, Activity, RefreshCw, Copy, Check, Code,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAIService } from '../../contexts/AIServiceContext';
import {
  getAIConversations, createAIConversation, getAIConversation,
  deleteAIConversation, addAIMessage, summarizeConversation,
} from '../../api/client';
import { sendChatMessage } from '../../api/aiClient';
import type { AIConversation, AIMessage } from '../../types';

/* ═══════════════════════════════════════════════════════
   Inline Markdown Renderer
   Handles: code blocks, inline code, bold, italic,
            headings, bullet/numbered lists, paragraphs
═══════════════════════════════════════════════════════ */

function CopyBtn({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
        copied
          ? 'text-green-400 bg-green-900/30'
          : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'
      } ${className}`}
      title="Copy"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// Render inline markdown: **bold**, *italic*, `code`
function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    if (m[2] !== undefined) parts.push(<strong key={key++} className="font-semibold">{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] !== undefined) parts.push(
      <code key={key++} className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[0.8em] font-mono text-pink-600 dark:text-pink-400">{m[4]}</code>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join('\n');
      nodes.push(
        <div key={key++} className="relative group rounded-xl overflow-hidden border border-gray-700 bg-gray-950 my-3">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-gray-400">
              <Code size={10} /> {lang || 'code'}
            </span>
            <CopyBtn text={code} />
          </div>
          <pre className="p-4 overflow-x-auto text-[0.78rem] leading-relaxed font-mono text-gray-100 whitespace-pre">
            <code>{code}</code>
          </pre>
        </div>
      );
      i++; // skip closing ```
      continue;
    }

    // Heading
    const headMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headMatch) {
      const level = headMatch[1].length;
      const cls = level === 1 ? 'text-base font-bold mt-3 mb-1' : level === 2 ? 'text-sm font-bold mt-2 mb-0.5' : 'text-xs font-bold mt-1.5 uppercase tracking-wide text-gray-500';
      nodes.push(<p key={key++} className={cls}><InlineText text={headMatch[2]} /></p>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="border-gray-200 dark:border-gray-700 my-2" />);
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (/^(\s*[-*•]\s)/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*•]\s)/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s/, ''));
        i++;
      }
      nodes.push(
        <ul key={key++} className="list-none space-y-0.5 my-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              <span><InlineText text={item} /></span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      nodes.push(
        <ol key={key++} className="space-y-0.5 my-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <span><InlineText text={item} /></span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line — skip
    if (line.trim() === '') { i++; continue; }

    // Regular paragraph
    nodes.push(
      <p key={key++} className="text-sm leading-relaxed">
        <InlineText text={line} />
      </p>
    );
    i++;
  }

  return <div className="space-y-1.5">{nodes}</div>;
}

/* ═══════════════════════════════════════════════════════
   Typing indicator
═══════════════════════════════════════════════════════ */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-purple-400 opacity-60"
          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════════ */
export default function ConversationWorkspace() {
  const { user } = useAuth();
  const { aiOnline, status: aiStatus, statusMessage } = useAIService();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConv, setActiveConv]       = useState<number | null>(null);
  const [messages, setMessages]           = useState<AIMessage[]>([]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [category, setCategory]           = useState('all');
  const [file, setFile]                   = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState<string | null>(null);
  const [hoveredMsg, setHoveredMsg]       = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fetchConversations(); }, [category]);
  useEffect(() => { if (activeConv) fetchMessages(activeConv); }, [activeConv]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const fetchConversations = async () => {
    try {
      const params: any = {};
      if (category !== 'all') params.category = category;
      const res = await getAIConversations(params);
      setConversations(res.data.data || []);
    } catch {}
  };

  const fetchMessages = async (id: number) => {
    try {
      const res = await getAIConversation(id);
      setMessages(res.data.data?.messages || []);
    } catch {}
  };

  const handleNewChat = async () => {
    try {
      const res = await createAIConversation({ title: 'New Chat', category: 'general' });
      const id  = res.data.data.id;
      setConversations(prev => [{
        id, title: 'New Chat', category: 'general',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        role: user?.role || 'citizen', is_multi_user: 0, status: 'active',
      } as AIConversation, ...prev]);
      setActiveConv(id);
      setMessages([]);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {}
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAIConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConv === id) { setActiveConv(null); setMessages([]); }
    } catch {}
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !file) return;
    if (!activeConv) return;
    const userMsg = input.trim();
    setInput('');

    const tempMsg: AIMessage = {
      id: Date.now(), conversation_id: activeConv, role: 'user',
      content: userMsg, content_type: 'text', created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setLoading(true);

    try {
      await addAIMessage(activeConv, { role: 'user', content: userMsg, content_type: 'text' });

      const chatHistory = [...messages, tempMsg].slice(-20).map(m => ({ role: m.role, content: m.content }));
      let imageBase64: string | undefined;
      let imageMime:   string | undefined;
      if (imagePreview) { imageBase64 = imagePreview.split(',')[1]; imageMime = file?.type || 'image/jpeg'; }

      const res = await sendChatMessage(userMsg, chatHistory, user?.role || 'citizen', user?.district, imageBase64, imageMime, activeConv);
      const reply = res.data.reply || 'No response';

      await addAIMessage(activeConv, { role: 'assistant', content: reply, content_type: 'text', tokens_used: res.data.tokens_used });
      setMessages(prev => [...prev, {
        id: Date.now() + 1, conversation_id: activeConv, role: 'assistant',
        content: reply, content_type: 'text', created_at: new Date().toISOString(),
      }]);

      // Update conversation title after first exchange
      setConversations(prev => prev.map(c => c.id === activeConv
        ? { ...c, title: c.title === 'New Chat' ? userMsg.slice(0, 40) : c.title, last_message: reply.slice(0, 60), updated_at: new Date().toISOString() }
        : c
      ));
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, conversation_id: activeConv, role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        content_type: 'text', created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      setFile(null);
      setImagePreview(null);
    }
  };

  const handleSummarize = async () => {
    if (!activeConv) return;
    try { await summarizeConversation(activeConv); fetchConversations(); } catch {}
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (msg: AIMessage, idx: number) => {
    const isUser = msg.role === 'user';
    const isHovered = hoveredMsg === msg.id;

    if (isUser) {
      return (
        <div key={msg.id} className="flex items-end justify-end gap-2.5 group">
          <div className="flex flex-col items-end gap-1 max-w-[78%]">
            {/* Bubble */}
            <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
            {/* Timestamp */}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 pr-1">{fmtTime(msg.created_at)}</span>
          </div>
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0 mb-5">
            <User size={13} className="text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      );
    }

    // AI message — full-width card style
    return (
      <div
        key={msg.id}
        className="flex items-start gap-3 group"
        onMouseEnter={() => setHoveredMsg(msg.id)}
        onMouseLeave={() => setHoveredMsg(null)}
      >
        {/* AI Avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
          <Bot size={15} className="text-white" />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <Sparkles size={10} /> Hydro AI
            </span>
            <div className={`flex items-center gap-1.5 transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              <CopyBtn text={msg.content} className="text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/60" />
              <span className="text-[10px] text-gray-400">{fmtTime(msg.created_at)}</span>
            </div>
          </div>

          {/* Message content */}
          <div className="prose-sm text-gray-800 dark:text-gray-200">
            <MarkdownContent text={msg.content} />
          </div>
        </div>
      </div>
    );
  };

  const suggestions = [
    'What is the current water quality status?',
    'Show me critical alerts in my district',
    'Which water points have the highest failure risk?',
    'Summarize recent citizen reports',
    'What maintenance tasks are overdue?',
  ];

  const activeTitle = conversations.find(c => c.id === activeConv)?.title || 'Chat';

  return (
    <>
      {/* Inject bounce keyframes once */}
      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>

      <div className="flex h-[calc(100vh-7rem)] gap-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">

        {/* ── Sidebar ── */}
        <div className={`${sidebarOpen ? 'w-64 xl:w-72' : 'w-0'} transition-all duration-200 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col flex-shrink-0 overflow-hidden`}>
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
            >
              <Plus size={15} /> New Conversation
            </button>
          </div>

          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <select value={category} onChange={e => setCategory(e.target.value)} className="input text-xs w-full bg-white dark:bg-gray-800">
              <option value="all">All Categories</option>
              <option value="general">General</option>
              <option value="incident">Incident</option>
              <option value="analysis">Analysis</option>
              <option value="report">Report</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">No conversations yet</p>
              </div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConv(conv.id)}
                  className={`group px-3 py-2.5 mx-1.5 my-0.5 rounded-lg cursor-pointer transition-colors ${
                    activeConv === conv.id
                      ? 'bg-blue-50 dark:bg-blue-900/25 border border-blue-200 dark:border-blue-800/50'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${activeConv === conv.id ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate leading-snug">{conv.title}</span>
                        <button
                          onClick={e => handleDelete(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-0.5 rounded flex-shrink-0"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      {conv.last_message && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5 leading-snug">{conv.last_message}</p>
                      )}
                      <div className="text-[9px] text-gray-400 dark:text-gray-600 mt-1">
                        {conv.message_count || 0} msgs · {new Date(conv.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Main Chat Area ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {!activeConv ? (
            /* ── Empty / Welcome state ── */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">Hydro AI Workspace</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                  Ask about water systems, environmental data, climate alerts, infrastructure status, and more.
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={async () => { await handleNewChat(); setTimeout(() => setInput(s), 300); }}
                      className="w-full px-4 py-2.5 text-left text-xs bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl text-gray-600 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-300 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Chat Header ── */}
              <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-900 flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {!sidebarOpen && (
                    <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                      <ChevronLeft size={16} />
                    </button>
                  )}
                  <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                    <MessageSquare size={15} />
                  </button>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">{activeTitle}</div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${aiOnline ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                      {aiOnline ? 'Hydro AI online' : statusMessage}
                      {messages.length > 0 && <span className="ml-1">· {messages.length} messages</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSummarize}
                  className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <FileText size={13} /> Summarize
                </button>
              </div>

              {/* ── Messages ── */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 bg-white dark:bg-gray-900">
                {messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-3">
                      <Bot size={18} className="text-white" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Hydro AI is ready</p>
                    <p className="text-xs text-gray-400 max-w-xs">Ask me anything about water infrastructure, climate data, flood alerts, or citizen reports.</p>
                  </div>
                )}

                {messages.map((msg, idx) => renderMessage(msg, idx))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Bot size={15} className="text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <Sparkles size={10} /> Hydro AI
                      </span>
                      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 inline-block">
                        <TypingDots />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Image preview */}
              {imagePreview && (
                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <img src={imagePreview} alt="Preview" className="h-10 w-10 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                    <span className="text-xs text-gray-500 flex-1 truncate">{file?.name}</span>
                    <button onClick={() => { setFile(null); setImagePreview(null); }} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Offline banner */}
              {!aiOnline && (
                <div className={`px-4 py-1.5 flex-shrink-0 border-t text-[10px] flex items-center gap-1.5 ${
                  aiStatus === 'reconnecting' || aiStatus === 'error'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                }`}>
                  {aiStatus === 'reconnecting' || aiStatus === 'error'
                    ? <RefreshCw size={10} className="animate-spin" />
                    : <WifiOff size={10} />}
                  {statusMessage}
                </div>
              )}

              {/* ── Input Area ── */}
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
                <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-3 py-2 focus-within:border-blue-400 dark:focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/30 transition-all">
                  <input
                    ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect} className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                    title="Attach file or image"
                  >
                    <Paperclip size={16} />
                  </button>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Ask Hydro AI about water systems, climate data, alerts…"
                    rows={1}
                    className="flex-1 bg-transparent resize-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none leading-relaxed py-1"
                    style={{ maxHeight: 120 }}
                  />

                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && !file) || loading}
                    className={`p-2 rounded-xl transition-all flex-shrink-0 ${
                      input.trim() || file
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>

                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center flex items-center justify-center gap-1.5">
                  {aiOnline
                    ? <><Wifi size={9} className="text-green-500" /> Hydro AI · Enter to send · Shift+Enter for new line</>
                    : <><Activity size={9} className="text-yellow-500 animate-pulse" /> {statusMessage}</>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
