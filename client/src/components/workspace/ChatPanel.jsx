import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, Plus, Download, MessageSquare, History, Sparkles, Check, Copy,
  Edit2, Send, CheckCircle2, Trash2, Pencil, X
} from 'lucide-react';
import { exportChatToPdf } from '../../services/pdfExportService';
import { aiAPI } from '../../services/api';

const normalizeAiAnswer = (value) => {
  if (value === null || value === undefined) return '';
  let normalized = typeof value === 'string'
    ? value
    : typeof value === 'object'
      ? (value.answer || value.text || JSON.stringify(value))
      : String(value);

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    try { normalized = JSON.parse(normalized); } catch { normalized = normalized.slice(1, -1); }
  }

  return String(normalized)
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    .replace(/\n{3,}/g, '\n\n').trim();
};

function RenderMessage({ text, isAi = false }) {
  const cleaned = normalizeAiAnswer(text);
  if (!cleaned) return null;

  if (!isAi) {
    return <p className="whitespace-pre-wrap leading-relaxed">{cleaned}</p>;
  }

  return (
    <div className="space-y-2.5 text-xs leading-relaxed max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-base font-bold text-slate-900 dark:text-white mt-3 mb-1.5" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1.5" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xs font-bold text-slate-900 dark:text-white mt-2.5 mb-1" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-2 mb-1" {...props} />,
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-700 dark:text-slate-200" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 my-1.5 pl-1 text-slate-700 dark:text-slate-200" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 my-1.5 pl-1 text-slate-700 dark:text-slate-200" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed text-slate-700 dark:text-slate-200" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-bold text-slate-900 dark:text-white" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-slate-600 dark:text-slate-300" {...props} />,
          a: ({ node, ...props }) => <a className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 underline underline-offset-2 font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2.5 rounded-lg border border-slate-200 dark:border-slate-700/80">
              <table className="w-full text-left border-collapse text-[11px]" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => <th className="bg-slate-100 dark:bg-slate-800/80 p-2 font-bold border-b border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200" {...props} />,
          td: ({ node, ...props }) => <td className="p-2 border-b border-slate-200 dark:border-slate-800/50 text-slate-700 dark:text-slate-300" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-2 border-indigo-500 pl-3 italic my-2 text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/20 py-1 rounded-r" {...props} />
          ),
          pre: ({ node, ...props }) => <div className="my-2 overflow-x-auto" {...props} />,
          code: ({ node, inline, className, children, ...props }) => {
            const hasNewlines = String(children || '').includes('\n');
            const match = /language-(\w+)/.exec(className || '');
            const isBlock = inline === false ? true : (match || hasNewlines);

            return isBlock ? (
              <pre className="bg-slate-900 text-slate-100 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-700 dark:border-slate-800 text-[11px] font-mono overflow-x-auto my-2">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="px-1.5 py-0.5 rounded bg-slate-100 text-indigo-700 border border-slate-200 dark:bg-slate-800/80 dark:text-indigo-300 dark:border-slate-700 text-xs font-mono inline"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatPanel({
  isDark,
  activeWorkspace,
  activeDocument = null,
  documentsCount = 0,
  chatMessages = [],
  chatSessions = [],
  activeSessionId,
  chatLoading,
  onSendMessage,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onSaveInlineEdit,
  onExportTranscript,
}) {
  const [chatTab, setChatTab] = useState('chat'); // 'chat' | 'history'
  const [chatInput, setChatInput] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditText, setInlineEditText] = useState('');
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const chatBottomRef = useRef(null);
  const chatInputRef = useRef(null);

  // Theme styles
  const bgMain = isDark ? 'bg-[#0B0F19]' : 'bg-[#F8FAFC]';
  const bgCard = isDark ? 'bg-[#111827]/80' : 'bg-white';
  const bgInput = isDark ? 'bg-[#0D1322]' : 'bg-slate-50';
  const bgSidebar = isDark ? 'bg-[#0D1322]/90' : 'bg-white';
  const bdBase = isDark ? 'border-slate-800' : 'border-slate-200';
  const inputBd = isDark
    ? 'border-slate-700/80 focus:border-indigo-500 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/20'
    : 'border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20';
  const accentText = isDark ? 'text-indigo-400' : 'text-indigo-600';
  const accentBg = isDark ? 'bg-indigo-500/10' : 'bg-indigo-50';
  const accentBd = isDark ? 'border-indigo-500' : 'border-indigo-500';
  const accentBdLt = isDark ? 'border-indigo-500/30' : 'border-indigo-200';
  const btnGrad = 'from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-500/25';
  const aiBubbleBd = isDark ? 'border-l-indigo-400' : 'border-l-indigo-500';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  const activeSession = chatSessions.find((s) => s.id === activeSessionId) || null;

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const handleCopyMessage = (msgId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleSaveRename = async (sessionId) => {
    const trimmed = (editingSessionTitle || '').trim();
    if (!trimmed || renameLoading) return;
    if (trimmed.length > 100) return;
    setRenameLoading(true);
    try {
      if (onRenameSession) {
        await onRenameSession(sessionId, trimmed);
      } else {
        await aiAPI.renameSession(sessionId, trimmed);
      }
      setEditingSessionId(null);
    } catch (err) {
      console.error('Failed to rename session:', err);
    } finally {
      setRenameLoading(false);
    }
  };

  const handleExport = async () => {
    if (exportLoading || chatMessages.length === 0) return;
    setExportLoading(true);
    try {
      if (onExportTranscript) {
        await onExportTranscript();
      } else {
        await exportChatToPdf({
          workspaceName: activeWorkspace?.name || 'Workspace',
          documentsCount,
          messages: chatMessages,
          activeDocumentTitle: activeDocument?.title,
        });
      }
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const handleStartInlineEdit = (msg) => {
    setInlineEditId(msg.id);
    setInlineEditText(msg.text);
  };

  const handleCancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineEditText('');
  };

  const handleSaveEdit = async (msgId) => {
    const text = inlineEditText.trim();
    if (!text) return;
    setInlineEditId(null);
    setInlineEditText('');
    await onSaveInlineEdit(msgId, text);
  };

  const handleSend = (e) => {
    if (e) e.preventDefault();
    const query = chatInput.trim();
    if (!query || chatLoading) return;
    setChatInput('');
    onSendMessage(query);
  };

  return (
    <aside className={`w-80 md:w-[350px] lg:w-[380px] xl:w-[410px] border-l flex flex-col shrink-0 ${bgSidebar} backdrop-blur-xl ${bdBase}`}>
      {/* Header */}
      <div className={`p-3.5 border-b flex items-center justify-between shrink-0 ${bgCard} ${bdBase}`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${isDark ? 'from-emerald-500 to-emerald-600' : 'from-indigo-500 to-purple-600'} text-white flex items-center justify-center shadow-md`}>
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold flex items-center gap-1.5">
              AURA AI
              <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-emerald-400' : 'bg-green-500'} animate-pulse`} />
            </h3>
            <p className={`text-[10px] font-mono ${accentText}`}>{documentsCount} FILES LOADED</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              onNewChat();
              setChatTab('chat');
            }}
            title="Start a fresh chat"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${accentBg} ${accentBdLt} ${accentText} hover:opacity-80 active:scale-95`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exportLoading || chatMessages.length === 0}
            title="Download Executive PDF Report"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40 active:scale-95 ${
              exportCopied
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 dark:text-emerald-400'
                : `${bgInput} ${bdBase} ${textMuted} hover:${textPrimary}`
            }`}
          >
            {exportLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="hidden sm:inline text-[11px]">Generating...</span>
              </>
            ) : exportCopied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline text-[11px]">Downloaded</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Export PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-Tabs: Active Chat vs Saved History */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 shrink-0 ${bgCard}/40 ${bdBase}`}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChatTab('chat')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              chatTab === 'chat'
                ? `${accentBg} ${accentBdLt} ${accentText} border shadow-xs`
                : `${textMuted} hover:${textPrimary}`
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setChatTab('history')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              chatTab === 'history'
                ? `${accentBg} ${accentBdLt} ${accentText} border shadow-xs`
                : `${textMuted} hover:${textPrimary}`
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
            {chatSessions.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                chatTab === 'history'
                  ? 'bg-indigo-500 text-white'
                  : isDark ? 'bg-slate-700/60 text-slate-300' : 'bg-slate-200 text-slate-700'
              }`}>
                {chatSessions.length}
              </span>
            )}
          </button>
        </div>

        {chatTab === 'chat' && activeSession && (
          <span className={`text-[10px] truncate max-w-[140px] font-mono ${textMuted}`}>
            {activeSession.title}
          </span>
        )}
      </div>

      {/* TAB 1: SAVED CHAT SESSIONS */}
      {chatTab === 'history' ? (
        <div className={`flex-1 overflow-y-auto p-3 space-y-2 ${bgMain}/60`}>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className={`text-xs font-bold uppercase tracking-wider ${accentText}`}>
              Saved Chats ({chatSessions.length})
            </span>
            <button
              onClick={() => {
                onNewChat();
                setChatTab('chat');
              }}
              className={`text-xs font-semibold px-2 py-1 rounded-lg border ${accentBg} ${accentBdLt} ${accentText} hover:opacity-80 flex items-center gap-1`}
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {chatSessions.length === 0 ? (
            <div className={`text-center py-12 text-xs ${textMuted}`}>
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No saved conversations in this workspace yet.
              <div className="mt-3">
                <button
                  onClick={() => {
                    onNewChat();
                    setChatTab('chat');
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${accentBg} ${accentBdLt} ${accentText}`}
                >
                  + Start First Chat
                </button>
              </div>
            </div>
          ) : (
            chatSessions.map((sess) => {
              const isCurrent = sess.id === activeSessionId;

              if (editingSessionId === sess.id) {
                return (
                  <div
                    key={sess.id}
                    onClick={(e) => e.stopPropagation()}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      isCurrent
                        ? `${bgCard} ${accentBd} ${textPrimary} shadow-md ring-1 ring-indigo-500/30`
                        : `${bgCard}/50 ${isDark ? 'border-slate-800/80' : 'border-slate-200'} ${textMuted}`
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <MessageSquare className={`w-4 h-4 shrink-0 ${isCurrent ? accentText : textMuted}`} />
                      <input
                        autoFocus
                        type="text"
                        maxLength={100}
                        value={editingSessionTitle}
                        onChange={(e) => setEditingSessionTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveRename(sess.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingSessionId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`flex-1 rounded-lg px-2.5 py-1 text-xs border outline-none font-semibold transition-all ${bgInput} ${inputBd}`}
                        placeholder="Session title..."
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveRename(sess.id);
                        }}
                        disabled={renameLoading || !editingSessionTitle.trim()}
                        title="Save title (Enter)"
                        className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-all disabled:opacity-40"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSessionId(null);
                        }}
                        title="Cancel (Esc)"
                        className={`${textMuted} hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-500/10 transition-all`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={sess.id}
                  onClick={() => {
                    onSelectSession(sess);
                    setChatTab('chat');
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isCurrent
                      ? `${bgCard} ${accentBd} ${textPrimary} shadow-md ring-1 ring-indigo-500/30`
                      : `${bgCard}/50 ${isDark ? 'border-slate-800/80 hover:border-indigo-500/30' : 'border-slate-200 hover:border-indigo-200'} ${textMuted}`
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                    <MessageSquare className={`w-4 h-4 shrink-0 ${isCurrent ? accentText : textMuted}`} />
                    <div className="truncate">
                      <p className={`text-xs font-semibold truncate ${
                        isCurrent
                          ? (isDark ? 'text-white' : 'text-indigo-600')
                          : (isDark ? 'text-slate-200' : 'text-slate-800')
                      }`}>{sess.title || 'Conversation'}</p>
                      <p className={`text-[10px] ${textMuted}`}>
                        {sess.message_count ? `${sess.message_count} messages` : 'Conversation thread'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSessionId(sess.id);
                        setEditingSessionTitle(sess.title || '');
                      }}
                      title="Rename chat session"
                      className={`${textMuted} hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-500/10 transition-all`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => onDeleteSession(sess.id, e)}
                      title="Delete chat thread"
                      className={`${textMuted} hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-all`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TAB 2: ACTIVE CHAT CONVERSATION */
        <div className={`flex-1 overflow-y-auto p-4 space-y-3.5 ${bgMain}/60`}>
          {chatMessages.map((msg, idx) => {
            const isAi = msg.sender === 'ai';
            const isCopied = copiedMessageId === msg.id;

            return (
              <div key={msg.id || idx} className={`group flex flex-col ${isAi ? 'items-start' : 'items-end'}`}>
                {/* Message Header */}
                <div className={`flex items-center gap-2 mb-1 text-[11px] px-1 ${textMuted}`}>
                  {isAi ? (
                    <span className={`font-semibold flex items-center gap-1 ${accentText}`}>
                      <Sparkles className="w-3 h-3 text-emerald-400" /> AURA AI
                    </span>
                  ) : (
                    <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      You {msg.edited && <span className={`text-[10px] italic ${textMuted}`}>(edited)</span>}
                    </span>
                  )}

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.text)}
                      title="Copy text"
                      className={`p-1 rounded transition-all ${
                        isDark
                          ? 'hover:bg-slate-700/40 text-slate-400 hover:text-white'
                          : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>

                    {!isAi && (
                      <button
                        type="button"
                        onClick={() => handleStartInlineEdit(msg)}
                        title="Edit question"
                        className={`p-1 rounded transition-all ${
                          isDark
                            ? 'hover:bg-slate-700/40 text-slate-400 hover:text-indigo-400'
                            : 'hover:bg-slate-200 text-slate-500 hover:text-indigo-600'
                        }`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Message Bubble */}
                {!isAi && inlineEditId === msg.id ? (
                  <div className={`w-full max-w-[95%] p-3 rounded-2xl rounded-tr-none border shadow-xl ${bgCard} ${accentBdLt}`}>
                    <textarea
                      value={inlineEditText}
                      onChange={(e) => setInlineEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveEdit(msg.id);
                        } else if (e.key === 'Escape') {
                          handleCancelInlineEdit();
                        }
                      }}
                      rows={Math.min(5, Math.max(2, inlineEditText.split('\n').length))}
                      autoFocus
                      className={`w-full p-2.5 rounded-xl text-xs outline-none resize-none border transition-all ${bgInput} ${inputBd}`}
                      placeholder="Edit your question..."
                    />
                    <div className={`flex items-center justify-between gap-2 mt-2 pt-2 border-t ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
                      <span className={`text-[10px] ${textMuted}`}>Enter to save • Esc to cancel</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCancelInlineEdit}
                          className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium transition-all ${textMuted} hover:${textPrimary} ${bdBase}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(msg.id)}
                          disabled={!inlineEditText.trim() || chatLoading}
                          className={`px-3 py-1 text-[11px] rounded-lg font-semibold bg-gradient-to-r ${btnGrad} text-white shadow-sm hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-1`}
                        >
                          <Send className="w-3 h-3" />
                          <span>Save & Submit</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`relative max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                    isAi
                      ? `${bgCard} border-l-2 ${aiBubbleBd} border ${bdBase} ${isDark ? 'text-gray-100' : 'text-slate-800'} shadow-md rounded-tl-none`
                      : `bg-gradient-to-r ${btnGrad} text-white rounded-tr-none shadow-md`
                  }`}>
                    <RenderMessage text={msg.text} isAi={isAi} />
                  </div>
                )}
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex flex-col items-start">
              <div className={`flex items-center gap-1.5 mb-1.5 text-xs ${accentText} px-1 font-semibold`}>
                <Sparkles className="w-3.5 h-3.5 animate-spin text-indigo-400" /> Thinking...
              </div>
              <div className={`p-3 rounded-2xl rounded-tl-none flex items-center gap-1.5 border ${bgCard} ${bdBase}`}>
                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-cyan-400' : 'bg-indigo-500'} dot-bounce-1`} />
                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-teal-400' : 'bg-purple-500'} dot-bounce-2`} />
                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-emerald-400' : 'bg-pink-500'} dot-bounce-3`} />
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>
      )}

      {/* Chat Input Form */}
      <form
        onSubmit={handleSend}
        className={`p-3 border-t shrink-0 flex items-center gap-2 ${bgCard} ${bdBase}`}
      >
        <input
          ref={chatInputRef}
          type="text"
          placeholder={
            !activeWorkspace
              ? 'Select a workspace first...'
              : activeDocument
                ? `Ask about "${activeDocument.title}" or all ${documentsCount} files...`
                : `Ask about ${documentsCount} document${documentsCount !== 1 ? 's' : ''}...`
          }
          disabled={!activeWorkspace || chatLoading}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          className={`flex-1 rounded-xl px-3.5 py-2.5 text-xs border transition-all outline-none ${bgInput} ${inputBd}`}
        />
        <button
          type="submit"
          disabled={!chatInput.trim() || !activeWorkspace || chatLoading}
          className={`p-2.5 bg-gradient-to-r ${btnGrad} disabled:opacity-40 text-white rounded-xl transition-all shadow-md`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}

