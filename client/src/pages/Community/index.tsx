import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api, {
  getCommunityChannels, getChannelMessages, sendChannelMessage,
  markMessageRead, uploadCommunityFile, uploadVoiceNote,
  createEvent, getEvents, joinCommunityEvent, leaveCommunityEvent,
  getReminders, updateReminderStatus, getPresence,
} from '../../api/client';
import {
  Hash, MessageSquare, Send, Users, Plus, Mic, Paperclip, X, Image,
  Calendar, MapPin, Video, Globe, Clock, Bell, BellOff,
  Check, CheckCheck, Loader2, ChevronDown, ChevronLeft,
  Wifi, WifiOff, Volume2, VolumeX, Settings,
} from 'lucide-react';

const CHANNEL_COLORS: Record<string, string> = {
  general: 'text-blue-400', announcements: 'text-amber-400',
  discussions: 'text-emerald-400', media: 'text-purple-400',
  events: 'text-rose-400', support: 'text-teal-400',
};

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function DeliveryIcon({ status }: { status: string }) {
  if (status === 'sent') return <Check size={12} className="text-gray-400" />;
  if (status === 'delivered') return <CheckCheck size={12} className="text-gray-400" />;
  if (status === 'read') return <CheckCheck size={12} className="text-blue-400" />;
  return null;
}

function EventAlarm({ events }: { events: any[] }) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAgICAf39/f35+fn59fX19fHx8fHt7e3t6enp6eXl5eXh4eHh3d3d3dnZ2dnV1dXV0dHR0c3Nzc3Jyc3JxcXFxcHBwcG9vb29ubm5ubW1tbWxsbGxra2tra2pqa2ppamppamlpaWhpaGhoZ2dnZ2ZmZmZlZWVlZGRkZGNjY2NjYmJiYmFhYWFgYGBgX19fX15eXl5dXV1dXFxcXFtbW1taWlpaWVlZWVhYWFhXV1dXVlZWVlVVVVVUVFRUU1NTU1JSUlJRUVFRUFBQUE9PT09OTk5OTU1NTUxMTExLS0tLSkpKSklJSUlISEhIR0dHR0ZGRkZFRUVFREVEREQ=');
    audioRef.current.loop = true;
    audioRef.current.volume = 0.3;
  }, []);

  const upcoming = events.filter(e => {
    const t = new Date(`${e.event_date}T${e.event_time}`).getTime();
    const now = Date.now();
    return t > now && t < now + 3600000 && !dismissed.has(e.id);
  });

  useEffect(() => {
    if (upcoming.length > 0 && audioRef.current) {
      audioRef.current.play().catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [upcoming.length]);

  if (upcoming.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {upcoming.map(e => (
        <div key={e.id} className="bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-xl shadow-2xl p-4 animate-bounce-in">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="animate-pulse" />
            <span className="font-bold text-sm">Event Starting Soon!</span>
          </div>
          <p className="text-sm font-semibold">{e.title}</p>
          <p className="text-xs text-rose-200 mt-0.5">{formatTime(e.event_time)} — {e.event_date}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => updateReminderStatus(e.reminder_id || e.id, 'snoozed').catch(() => {})}
              className="text-xs px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              Snooze 5min
            </button>
            <button onClick={() => setDismissed(prev => new Set(prev).add(e.id))}
              className="text-xs px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Channel sidebar ──
function ChannelSidebar({
  channels, activeChannel, onSelect, onNewChannel, onlineCount, connected, unreadMap, typingMap,
}: {
  channels: any[]; activeChannel: any; onSelect: (ch: any) => void; onNewChannel: () => void;
  onlineCount: number; connected: boolean; unreadMap: Record<number, boolean>; typingMap: Record<number, number>;
}) {
  return (
    <div className="w-60 bg-gray-900 text-gray-200 flex flex-col h-full border-r border-gray-800">
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={18} className="text-blue-400" />
          <span className="font-bold text-sm">Community</span>
          {connected ? <Wifi size={12} className="text-green-400 ml-auto" /> : <WifiOff size={12} className="text-red-400 ml-auto" />}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Users size={12} />
          <span>{onlineCount} online</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1">Channels</div>
        {channels.map(ch => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${
              activeChannel?.id === ch.id
                ? 'bg-blue-600/20 text-blue-300'
                : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            <Hash size={14} className={CHANNEL_COLORS[ch.type] || 'text-gray-500'} />
            <span className="flex-1 truncate">{ch.name}</span>
            {unreadMap[ch.id] && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />}
            {(typingMap[ch.id] || 0) > 0 && <span className="text-[10px] text-emerald-400 animate-pulse">...</span>}
          </button>
        ))}
      </div>

      <div className="p-2 border-t border-gray-800">
        <button onClick={onNewChannel}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
          <Plus size={14} />
          <span>Add Channel</span>
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ──
function MessageBubble({ msg, isOwn, onRead }: { msg: any; isOwn: boolean; onRead: () => void }) {
  const msgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOwn && msgRef.current) {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) onRead();
      }, { threshold: 0.5 });
      observer.observe(msgRef.current);
      return () => observer.disconnect();
    }
  }, [isOwn, onRead]);

  return (
    <div ref={msgRef} className={`flex gap-2 mb-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {(msg.user_name || '?')[0].toUpperCase()}
        </div>
      )}
      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && <div className="text-[11px] text-gray-400 mb-0.5 ml-1">{msg.user_name}</div>}
        <div className={`rounded-2xl px-3 py-2 text-sm ${
          isOwn
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
        }`}>
          {msg.message_type === 'image' && (
            <img src={msg.media_url} alt="" className="max-w-[200px] rounded-lg mb-1 cursor-pointer" onClick={() => window.open(msg.media_url)} />
          )}
          {msg.message_type === 'video' && (
            <video src={msg.media_url} controls className="max-w-[250px] rounded-lg mb-1" />
          )}
          {msg.message_type === 'voice' && (
            <audio src={msg.media_url} controls className="h-8 w-48" />
          )}
          {msg.message_type === 'file' && (
            <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm underline decoration-dotted">
              <Paperclip size={14} /> {msg.content || 'Download File'}
            </a>
          )}
          {msg.content && (
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          )}
          {msg.reply_to && <div className="text-[10px] opacity-50 mt-1">↪ Reply</div>}
        </div>
        <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-gray-400">{formatTime(msg.created_at)}</span>
          {isOwn && <DeliveryIcon status={msg.delivery_status} />}
        </div>
      </div>
    </div>
  );
}

// ── Events Panel ──
function EventsPanel({ events, onJoin, onLeave, onCreateEvent }: {
  events: any[]; onJoin: (id: number) => void; onLeave: (id: number) => void; onCreateEvent: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', event_type: 'online', location: '', venue: '', meeting_link: '', district: '', event_date: '', event_time: '', max_participants: 100, reminder_minutes: 30 });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await createEvent(form); setShowForm(false); } catch {}
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2"><Calendar size={16} /> Events</h3>
        <button onClick={() => setShowForm(true)} className="text-xs px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ New</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {events.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No upcoming events</p>}
        {events.map(e => {
          const meta = e.metadata || {};
          const isOnline = e.event_type === 'online' || e.event_type === 'hybrid';
          const isPhysical = e.event_type === 'physical' || e.event_type === 'hybrid';
          return (
            <div key={e.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-2 mb-1">
                {e.event_type === 'online' ? <Video size={16} className="text-blue-500 mt-0.5" /> :
                 e.event_type === 'physical' ? <MapPin size={16} className="text-rose-500 mt-0.5" /> :
                 <Globe size={16} className="text-purple-500 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm">{e.title}</h4>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 mt-0.5">
                    <div className="flex items-center gap-1">
                      <Clock size={10} /> {e.event_date} @ {e.event_time}
                    </div>
                    {isPhysical && e.location && <div>📍 {e.location}</div>}
                    {isOnline && meta.meeting_link && (
                      <a href={meta.meeting_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">🔗 Join Meeting</a>
                    )}
                  </div>
                </div>
              </div>
              {e.description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{e.description}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-400">{e.participant_count || 0}/{e.max_volunteers} joined</span>
                {e.i_joined ? (
                  <button onClick={() => onLeave(e.id)} className="text-xs px-2 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Leave</button>
                ) : (
                  <button onClick={() => onJoin(e.id)} className="text-xs px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Join</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold">New Event</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <input className="input" placeholder="Event Title *" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <textarea className="input" rows={2} placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <select className="input" value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })}>
                <option value="online">Online (Zoom/Meet/Teams)</option>
                <option value="physical">Physical (Venue + GPS)</option>
                <option value="hybrid">Hybrid (Both)</option>
              </select>
              {['online', 'hybrid'].includes(form.event_type) && (
                <input className="input" placeholder="Meeting Link (Zoom/Google Meet/Teams)" value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} />
              )}
              {['physical', 'hybrid'].includes(form.event_type) && (
                <input className="input" placeholder="Venue / Location" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
              )}
              <input className="input" placeholder="District" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className="input" type="date" required value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
                <input className="input" type="time" required value={form.event_time} onChange={e => setForm({ ...form, event_time: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" type="number" placeholder="Max Participants" value={form.max_participants} onChange={e => setForm({ ...form, max_participants: parseInt(e.target.value) || 100 })} />
                <input className="input" type="number" placeholder="Reminder (min)" value={form.reminder_minutes} onChange={e => setForm({ ...form, reminder_minutes: parseInt(e.target.value) || 30 })} />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Create Event</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// MAIN COMMUNITY PAGE
// ══════════════════════════════════════════════

export default function CommunityPage() {
  const { user } = useAuth();
  const { socket, connected, onlineUsers, joinChannel, leaveChannel, sendTypingStart, sendTypingStop } = useSocket();

  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showEvents, setShowEvents] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<number, boolean>>({});
  const [typingMap, setTypingMap] = useState<Record<number, number>>({});
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const res = await getCommunityChannels();
      setChannels(res.data.data);
      if (!activeChannel && res.data.data.length > 0) {
        setActiveChannel(res.data.data[0]);
      }
    } catch {}
    finally { setLoading(false); }
  }, [activeChannel]);

  // Load messages for active channel
  const loadMessages = useCallback(async () => {
    if (!activeChannel) return;
    try {
      const res = await getChannelMessages(activeChannel.id, { limit: 100 });
      setMessages(res.data.data || []);
      // Mark visible messages as read
      const userId = user?.id;
      if (userId) {
        (res.data.data || []).forEach((m: any) => {
          if (m.user_id !== userId) markMessageRead(m.id).catch(() => {});
        });
      }
    } catch {}
  }, [activeChannel, user]);

  // Load events
  const loadEvents = useCallback(async () => {
    try { const res = await getEvents(); setEvents(res.data.data || []); } catch {}
  }, []);

  // Load reminders
  const loadReminders = useCallback(async () => {
    try { const res = await getReminders(); setReminders(res.data.data || []); } catch {}
  }, []);

  useEffect(() => { loadChannels(); }, []);
  useEffect(() => { loadMessages(); }, [activeChannel]);
  useEffect(() => { loadEvents(); }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (msg: any) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        const updated = [...prev, msg];
        if (msg.channel_id === activeChannel?.id) {
          if (msg.user_id !== user?.id) markMessageRead(msg.id).catch(() => {});
        } else if (msg.user_id !== user?.id) {
          setUnreadMap(prevMap => ({ ...prevMap, [msg.channel_id]: true }));
        }
        return updated;
      });
    };

    const onMessageDelivered = ({ message_id }: { message_id: number }) => {
      setMessages(prev => prev.map(m => m.id === message_id ? { ...m, delivery_status: 'delivered' } : m));
    };

    const onMessageRead = ({ message_id }: { message_id: number }) => {
      setMessages(prev => prev.map(m => m.id === message_id ? { ...m, delivery_status: 'read' } : m));
    };

    const onUserTyping = ({ channel_id, user_id, user_name }: { channel_id: number; user_id: number; user_name: string }) => {
      if (user_id !== user?.id) {
        setTypingMap(prev => ({ ...prev, [channel_id]: (prev[channel_id] || 0) + 1 }));
        setTimeout(() => setTypingMap(prev => ({ ...prev, [channel_id]: Math.max(0, (prev[channel_id] || 0) - 1) })), 4000);
      }
    };

    const onNewEvent = () => { loadEvents(); loadReminders(); };

    socket.on('new_message', onNewMessage);
    socket.on('message_delivered', onMessageDelivered);
    socket.on('message_read', onMessageRead);
    socket.on('user_typing', onUserTyping);
    socket.on('new_event', onNewEvent);
    socket.on('event_updated', loadEvents);

    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_delivered', onMessageDelivered);
      socket.off('message_read', onMessageRead);
      socket.off('user_typing', onUserTyping);
      socket.off('new_event', onNewEvent);
      socket.off('event_updated', loadEvents);
    };
  }, [socket, activeChannel, user, loadEvents, loadReminders]);

  // Join/leave channel room
  useEffect(() => {
    if (!activeChannel) return;
    joinChannel(activeChannel.id);
    setUnreadMap(prev => ({ ...prev, [activeChannel.id]: false }));
    return () => leaveChannel(activeChannel.id);
  }, [activeChannel, joinChannel, leaveChannel]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Recording timer
  useEffect(() => {
    if (!recording) { setRecordingDuration(0); return; }
    const interval = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);

  const handleSend = async () => {
    if (!messageInput.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const res = await sendChannelMessage({ channel_id: activeChannel.id, content: messageInput.trim() });
      setMessages(prev => [...prev, res.data.data]);
      setMessageInput('');
    } catch {}
    finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);
    if (activeChannel && user) {
      sendTypingStart(activeChannel.id, user.name);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStop(activeChannel.id);
      }, 3000);
    }
  };

  const handleFileUpload = async (type: 'image' | 'file') => {
    const input = type === 'image' ? imageInputRef : fileInputRef;
    input.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChannel) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await uploadCommunityFile(formData);
      await sendChannelMessage({
        channel_id: activeChannel.id,
        content: file.name,
        message_type: file.type.startsWith('image/') ? 'image' : 'file',
        media_url: res.data.data.url,
      });
    } catch {}
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size > 0 && activeChannel) {
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          fd.append('channel_id', String(activeChannel.id));
          fd.append('duration', String(recordingDuration));
          try { await uploadVoiceNote(fd); } catch {}
        }
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch {}
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    setRecording(false);
    setMediaRecorder(null);
  };

  const handleJoinEvent = async (id: number) => {
    try { await joinCommunityEvent(id); loadEvents(); } catch {}
  };
  const handleLeaveEvent = async (id: number) => {
    try { await leaveCommunityEvent(id); loadEvents(); } catch {}
  };

  const onlineCount = onlineUsers.size;

  return (
    <>
      <EventAlarm events={reminders} />
      <div className="flex h-[calc(100vh-3.5rem)] bg-white dark:bg-gray-950 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Channel Sidebar */}
        {showSidebar && (
          <ChannelSidebar
            channels={channels}
            activeChannel={activeChannel}
            onSelect={ch => { setActiveChannel(ch); setShowSidebar(window.innerWidth > 768); }}
            onNewChannel={() => setShowNewChannel(true)}
            onlineCount={onlineCount}
            connected={connected}
            unreadMap={unreadMap}
            typingMap={typingMap}
          />
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <button onClick={() => setShowSidebar(!showSidebar)} className="md:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            {activeChannel && (
              <>
                <Hash size={16} className={CHANNEL_COLORS[activeChannel.type] || 'text-gray-500'} />
                <span className="font-semibold text-sm">{activeChannel.name}</span>
                {activeChannel.description && <span className="text-xs text-gray-400 hidden sm:inline ml-1">— {activeChannel.description}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setShowEvents(!showEvents)}
                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${showEvents ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'}`}>
                    <Calendar size={14} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-gray-50/50 dark:bg-gray-900/50">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isOwn={msg.user_id === user?.id}
                onRead={() => markMessageRead(msg.id).catch(() => {})}
              />
            ))}
            {typingMap[activeChannel?.id || 0] > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400 italic py-1">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                Someone is typing...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            {recording ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-red-600">Recording {recordingDuration}s</span>
                  <div className="flex-1 h-1 bg-red-200 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full animate-pulse" style={{ width: `${(recordingDuration % 10) * 10}%` }} />
                  </div>
                </div>
                <button onClick={stopRecording} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <button onClick={() => handleFileUpload('image')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors" title="Send Image">
                  <Image size={18} />
                </button>
                <button onClick={() => handleFileUpload('file')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors" title="Attach File">
                  <Paperclip size={18} />
                </button>
                <button onClick={startRecording} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-rose-500 transition-colors" title="Voice Note">
                  <Mic size={18} />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message #${activeChannel?.name || 'channel'}`}
                    rows={1}
                    className="input pr-10 resize-none py-2.5 text-sm rounded-xl"
                    style={{ minHeight: 40, maxHeight: 120 }}
                  />
                </div>
                <button onClick={handleSend} disabled={!messageInput.trim() || sending}
                  className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            )}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
          </div>
        </div>

        {/* Events Panel (Right sidebar) */}
        {showEvents && (
          <div className="w-80 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 hidden lg:block">
            <EventsPanel events={events} onJoin={handleJoinEvent} onLeave={handleLeaveEvent} onCreateEvent={() => {}} />
          </div>
        )}
      </div>

      {/* New Channel Modal */}
      {showNewChannel && (
        <NewChannelModal onClose={() => setShowNewChannel(false)} onCreated={(ch) => { setChannels(prev => [...prev, ch]); setActiveChannel(ch); setShowNewChannel(false); }} />
      )}
    </>
  );
}

function NewChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ch: any) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState('general');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { createCommunityChannel } = await import('../../api/client');
      const res = await createCommunityChannel({ name: name.trim(), description: desc, type });
      const newCh = { id: res.data.data.id, name: name.trim(), description: desc, type, message_count: 0 };
      onCreated(newCh);
    } catch {}
    finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-bold">New Channel</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <input className="input" placeholder="Channel name *" value={name} onChange={e => setName(e.target.value)} required />
          <input className="input" placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            <option value="general">General</option>
            <option value="announcements">Announcements</option>
            <option value="discussions">Discussions</option>
            <option value="media">Media</option>
            <option value="events">Events</option>
            <option value="support">Support</option>
          </select>
          <button type="submit" disabled={creating} className="btn-primary w-full justify-center">
            {creating && <Loader2 size={16} className="animate-spin" />}
            {creating ? 'Creating...' : 'Create Channel'}
          </button>
        </form>
      </div>
    </div>
  );
}
