import { useState, useEffect, useRef } from 'react';
import {
  Send, Plus, Trash2, MessageSquare, History, Upload, Image,
  FileText, Search, Mic, MoreVertical, X, ChevronLeft,
  Bot, User, Sparkles, Paperclip, Loader2, Wifi, WifiOff, Activity, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAIService } from '../../contexts/AIServiceContext';
import {
  getAIConversations, createAIConversation, getAIConversation,
  deleteAIConversation, addAIMessage, summarizeConversation,
} from '../../api/client';
import { sendChatMessage } from '../../api/aiClient';
import type { AIConversation, AIMessage } from '../../types';

export default function ConversationWorkspace() {
  const { user } = useAuth();
  const { aiOnline, status: aiStatus, statusMessage } = useAIService();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConv, setActiveConv] = useState<number | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [category, setCategory] = useState('all');
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchConversations(); }, [category]);
  useEffect(() => { if (activeConv) fetchMessages(activeConv); }, [activeConv]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
      const id = res.data.data.id;
      setConversations(prev => [{ id, title: 'New Chat', category: 'general', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), role: user?.role || 'citizen', is_multi_user: 0, status: 'active' } as AIConversation, ...prev]);
      setActiveConv(id);
      setMessages([]);
      setInput('');
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

      const chatHistory = [...messages, tempMsg].slice(-20).map(m => ({
        role: m.role, content: m.content,
      }));

      let imageBase64: string | undefined;
      let imageMime: string | undefined;
      if (imagePreview) {
        imageBase64 = imagePreview.split(',')[1];
        imageMime = file?.type || 'image/jpeg';
      }

      const res = await sendChatMessage(
        userMsg, chatHistory, user?.role || 'citizen',
        user?.district, imageBase64, imageMime, activeConv,
      );

      const reply = res.data.reply || 'No response';
      await addAIMessage(activeConv, {
        role: 'assistant', content: reply, content_type: 'text',
        tokens_used: res.data.tokens_used,
      });

      setMessages(prev => [...prev, {
        id: Date.now() + 1, conversation_id: activeConv, role: 'assistant',
        content: reply, content_type: 'text', created_at: new Date().toISOString(),
      }]);
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
    try {
      await summarizeConversation(activeConv);
      fetchConversations();
    } catch {}
  };

  const renderMessage = (msg: AIMessage) => {
    const isUser = msg.role === 'user';
    return (
      <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-blue-100' : 'bg-purple-100'}`}>
          {isUser ? <User size={14} className="text-blue-600" /> : <Bot size={14} className="text-purple-600" />}
        </div>
        <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
          }`}>
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
          <div className="text-[10px] text-gray-400 mt-1 px-1">
            {new Date(msg.created_at).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  };

  const suggestions = [
    'What is the current water quality status?',
    'Show me critical alerts',
    'Which districts have the highest failure risk?',
    'Summarize recent citizen reports',
    'What maintenance is overdue?',
  ];

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-200 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col flex-shrink-0 overflow-hidden`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New Chat
          </button>
        </div>

        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <select value={category} onChange={e => setCategory(e.target.value)} className="input text-xs w-full">
            <option value="all">All Categories</option>
            <option value="general">General</option>
            <option value="incident">Incident</option>
            <option value="analysis">Analysis</option>
            <option value="report">Report</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
              No conversations yet
            </div>
          ) : (
            conversations.map(conv => (
              <div key={conv.id}
                onClick={() => setActiveConv(conv.id)}
                className={`p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors ${activeConv === conv.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{conv.title}</div>
                    {conv.last_message && <div className="text-xs text-gray-400 truncate mt-0.5">{conv.last_message}</div>}
                    <div className="text-[10px] text-gray-400 mt-1">
                      {conv.message_count || 0} messages · {new Date(conv.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button onClick={e => handleDelete(conv.id, e)} className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity p-1">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles size={28} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">AI Conversation Workspace</h2>
              <p className="text-sm text-gray-500 mb-6">
                Start a new conversation or select an existing one. Hydro AI can analyze data, images, documents, and provide environmental intelligence.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map(s => (
                  <button key={s} onClick={() => { handleNewChat(); setTimeout(() => setInput(s), 300); }}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300 transition-colors"
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-900">
              <div className="flex items-center gap-3">
                {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={18} /></button>}
                <div>
                  <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                    {conversations.find(c => c.id === activeConv)?.title || 'Chat'}
                  </div>
                  <div className="text-xs text-gray-400">{messages.length} messages</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSummarize} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100" title="Summarize conversation">
                  <FileText size={14} /> Summarize
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
              {messages.map(renderMessage)}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <Bot size={14} className="text-purple-600" />
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5">
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File Preview */}
            {imagePreview && (
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <img src={imagePreview} alt="Preview" className="h-12 w-12 object-cover rounded-lg" />
                  <span className="text-xs text-gray-500">{file?.name}</span>
                  <button onClick={() => { setFile(null); setImagePreview(null); }} className="ml-auto text-gray-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Connection status */}
            {!aiOnline && (
              <div className={`px-4 py-1 flex-shrink-0 border-t text-[10px] flex items-center gap-1.5 ${
                aiStatus === 'reconnecting' || aiStatus === 'error'
                  ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}>
                {aiStatus === 'reconnecting' || aiStatus === 'error' ? (
                  <RefreshCw size={10} className="animate-spin" />
                ) : (
                  <WifiOff size={10} />
                )}
                {statusMessage}
              </div>
            )}

            {/* Input Area */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect} className="hidden"
                />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <Paperclip size={18} />
                </button>
                <div className="flex-1 relative">
                  <input
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Ask Hydro AI about water systems, environmental data..."
                    className="input pr-10 py-2.5 text-sm w-full"
                  />
                </div>
                <button onClick={handleSend} disabled={!input.trim() && !file} className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors">
                  <Send size={16} />
                </button>
              </div>
              <div className="text-[10px] text-gray-400 mt-1.5 text-center flex items-center justify-center gap-2">
                {aiOnline ? (
                  <><Wifi size={10} className="text-green-500" /> Environmental intelligence systems online · Upload images for analysis</>
                ) : (
                  <><Activity size={10} className="text-yellow-500 animate-pulse" /> {statusMessage}</>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
