import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, FileText, Moon, Sun, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { workspacesAPI, documentsAPI, aiAPI } from '../services/api';
import WorkspaceSidebar from '../components/workspace/WorkspaceSidebar';
import DocumentPanel from '../components/workspace/DocumentPanel';
import ChatPanel from '../components/workspace/ChatPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { exportChatToPdf } from '../services/pdfExportService';

const normalizeAiAnswer = (value) => {
  if (value === null || value === undefined) return '';
  let normalized = typeof value === 'object'
    ? (value.answer || value.text || JSON.stringify(value))
    : String(value);

  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    try { normalized = JSON.parse(normalized); } catch { normalized = normalized.slice(1, -1); }
  }
  return String(normalized)
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    .replace(/\n{3,}/g, '\n\n').trim();
};

export default function WorkspacePage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();

  // ── Theme State ─────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('theme_mode') || 'dark');
  const isDark = theme === 'dark';
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme_mode', next);
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // ── Top-Level App State ─────────────────────────────────────────────────────
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  // ── Data Fetching ───────────────────────────────────────────────────────────
  const fetchWorkspaces = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await workspacesAPI.getAll();
      const list = Array.isArray(res.data) ? res.data : [];
      setIsConnected(true);
      setWorkspaces(list);
      if (list.length > 0 && !activeWorkspaceId) {
        setActiveWorkspaceId(String(list[0].id));
        setActiveWorkspace(list[0]);
      }
    } catch {
      setIsConnected(false);
    } finally {
      setDataLoading(false);
    }
  }, [activeWorkspaceId]);

  const fetchWorkspaceData = useCallback(async (wsId) => {
    try {
      const [docsRes, sessionsRes] = await Promise.all([
        documentsAPI.getByWorkspace(wsId),
        aiAPI.getSessions(wsId),
      ]);
      const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
      const sessions = Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
      setIsConnected(true);
      setDocuments(docs);
      if (docs.length > 0) setSelectedDocId(String(docs[0].id));

      setChatSessions(sessions);
      if (sessions.length > 0) {
        const latestSess = sessions[0];
        setActiveSessionId(latestSess.id);
        const historyRes = await aiAPI.getHistory(wsId, latestSess.id);
        const history = Array.isArray(historyRes.data) ? historyRes.data : [];
        setChatMessages(
          history.length > 0
            ? history.map((m) => ({ id: m.id, sender: m.sender, text: m.message }))
            : [{ id: 'init', sender: 'ai', text: `Welcome to "${activeWorkspace?.name || 'Workspace'}"! Ask me anything about your documents.` }]
        );
      } else {
        setActiveSessionId(null);
        setChatMessages([
          { id: 'init', sender: 'ai', text: `Welcome to "${activeWorkspace?.name || 'Workspace'}"! Upload documents and ask me anything.` }
        ]);
      }
    } catch {
      setIsConnected(false);
      setDocuments([]);
      setChatSessions([]);
      setActiveSessionId(null);
      setChatMessages([{ id: 'init', sender: 'ai', text: 'Workspace is empty. Add documents to start.' }]);
    }
  }, [activeWorkspace?.name]);

  useEffect(() => {
    if (token) fetchWorkspaces();
  }, [token, fetchWorkspaces]);

  useEffect(() => {
    if (token && activeWorkspaceId) fetchWorkspaceData(activeWorkspaceId);
  }, [activeWorkspaceId, token, fetchWorkspaceData]);

  // ── Workspace Handlers ──────────────────────────────────────────────────────
  const handleSelectWorkspace = (ws) => {
    setActiveWorkspaceId(String(ws.id));
    setActiveWorkspace(ws);
    setDocuments([]);
    setSelectedDocId(null);
    setChatMessages([]);
    setChatSessions([]);
    setActiveSessionId(null);
  };

  const handleCreateWorkspace = async (name, desc) => {
    const res = await workspacesAPI.create(name, desc);
    const created = res.data;
    setWorkspaces((prev) => [created, ...prev]);
    setActiveWorkspaceId(String(created.id));
    setActiveWorkspace(created);
    setDocuments([]);
    setChatSessions([]);
    setActiveSessionId(null);
    setChatMessages([{ id: 'init', sender: 'ai', text: `Workspace "${created.name}" created! Upload documents and start chatting.` }]);
  };

  const handleDeleteWorkspace = async (wsId, e) => {
    if (e) e.stopPropagation();
    try { await workspacesAPI.delete(wsId); } catch {}
    const updated = workspaces.filter((w) => String(w.id) !== String(wsId));
    setWorkspaces(updated);
    if (String(activeWorkspaceId) === String(wsId)) {
      const next = updated[0] || null;
      setActiveWorkspaceId(next ? String(next.id) : null);
      setActiveWorkspace(next);
      setDocuments([]);
      setSelectedDocId(null);
      setChatMessages([]);
      setChatSessions([]);
      setActiveSessionId(null);
    }
  };

  // ── Document Handlers ───────────────────────────────────────────────────────
  const handleSaveDocumentText = async (title, content) => {
    if (!activeWorkspaceId) return;
    const res = await documentsAPI.createText(activeWorkspaceId, title, content);
    setDocuments((prev) => [res.data, ...prev]);
    setSelectedDocId(String(res.data.id));
  };

  const handleUploadFiles = async (files, title, onProgress) => {
    if (!activeWorkspaceId) return [];
    const uploadedDocs = [];
    const failedFiles = [];

    // Concurrently upload multiple selected files in parallel batches of 5
    const BATCH_SIZE = 5;
    let completedCount = 0;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const docTitle = (files.length === 1 && title) ? title : file.name;
          try {
            const res = await documentsAPI.uploadFile(activeWorkspaceId, file, docTitle);
            return { success: true, data: res.data };
          } catch (err) {
            return {
              success: false,
              file: file.name,
              error: err.response?.data?.message || err.message,
            };
          }
        })
      );

      for (const result of batchResults) {
        completedCount++;
        if (onProgress) onProgress(completedCount, files.length);
        if (result.success) {
          uploadedDocs.push(result.data);
        } else {
          failedFiles.push(`${result.file} (${result.error})`);
        }
      }
    }

    if (uploadedDocs.length > 0) {
      setDocuments((prev) => [...uploadedDocs, ...prev]);
      setSelectedDocId(String(uploadedDocs[0].id));
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'doc_notice_' + Date.now(),
          sender: 'ai',
          text: `📁 ${uploadedDocs.length} new document${uploadedDocs.length > 1 ? 's' : ''} added to knowledge base! You can ask questions about ${uploadedDocs.length > 1 ? 'them' : `"${uploadedDocs[0].title}"`} now, or click "+ New Chat" to start fresh.`,
        }
      ]);
    }
    return failedFiles;
  };

  const handleDeleteDoc = async (docId) => {
    try { await documentsAPI.delete(docId); } catch {}
    const rem = documents.filter((d) => String(d.id) !== String(docId));
    setDocuments(rem);
    if (String(selectedDocId) === String(docId)) {
      setSelectedDocId(rem[0] ? String(rem[0].id) : null);
    }
  };

  const handleAskAiAboutDoc = (docTitle) => {
    handleSendMessage(`Give me a concise summary and key highlights of "${docTitle}".`);
  };

  // ── Chat Handlers ───────────────────────────────────────────────────────────
  const handleSendMessage = async (queryText) => {
    const query = (queryText || '').trim();
    if (!query || !activeWorkspaceId || chatLoading) return;

    setChatLoading(true);
    const tempUserId = 'u_' + Date.now();
    setChatMessages((prev) => [...prev, { id: tempUserId, sender: 'user', text: query }]);

    try {
      const res = await aiAPI.query(activeWorkspaceId, query, activeSessionId, null, selectedDocId);
      const aiText = normalizeAiAnswer(res.data?.answer || 'Response generated.');

      if (res.data?.session_id && res.data.session_id !== activeSessionId) {
        setActiveSessionId(res.data.session_id);
      }

      if (res.data?.user_message?.id) {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === tempUserId ? { ...m, id: res.data.user_message.id } : m))
        );
      }

      setChatMessages((prev) => [
        ...prev,
        { id: res.data?.message?.id || ('ai_' + Date.now()), sender: 'ai', text: aiText }
      ]);

      aiAPI.getSessions(activeWorkspaceId).then((sRes) => {
        if (Array.isArray(sRes.data)) setChatSessions(sRes.data);
      }).catch(() => {});
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK'
          ? 'Could not connect to the AI server. Check backend connection.'
          : (err.message || 'Error processing AI query.'));

      setChatMessages((prev) => [
        ...prev,
        { id: 'ai_err_' + Date.now(), sender: 'ai', text: errorMsg }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleNewChat = async () => {
    if (!activeWorkspaceId) return;
    try {
      const res = await aiAPI.createSession(activeWorkspaceId, 'New Chat');
      const newSess = res.data;
      setChatSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(newSess.id);
      setChatMessages([
        { id: 'init_' + Date.now(), sender: 'ai', text: `✨ New chat session started. Ask any question about your ${documents.length} document${documents.length !== 1 ? 's' : ''}!` }
      ]);
    } catch {
      setActiveSessionId(null);
      setChatMessages([{ id: 'init_' + Date.now(), sender: 'ai', text: '✨ New chat session started.' }]);
    }
  };

  const handleSelectSession = async (sess) => {
    if (!activeWorkspaceId || !sess) return;
    setActiveSessionId(sess.id);
    setChatLoading(true);
    try {
      const historyRes = await aiAPI.getHistory(activeWorkspaceId, sess.id);
      const history = Array.isArray(historyRes.data) ? historyRes.data : [];
      setChatMessages(
        history.length > 0
          ? history.map((m) => ({ id: m.id, sender: m.sender, text: m.message }))
          : [{ id: 'init', sender: 'ai', text: `Session "${sess.title}" is ready. Ask any question!` }]
      );
    } catch {
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId, e) => {
    if (e) e.stopPropagation();
    try { await aiAPI.deleteSession(sessionId); } catch {}
    const updated = chatSessions.filter((s) => s.id !== sessionId);
    setChatSessions(updated);
    if (activeSessionId === sessionId) {
      if (updated.length > 0) {
        handleSelectSession(updated[0]);
      } else {
        setActiveSessionId(null);
        setChatMessages([{ id: 'init', sender: 'ai', text: 'Chat history cleared. Click "+ New Chat" to start fresh.' }]);
      }
    }
  };

  const handleRenameSession = async (sessionId, newTitle) => {
    try {
      const res = await aiAPI.renameSession(sessionId, newTitle);
      const updated = res.data;
      setChatSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title || newTitle } : s))
      );
      return updated;
    } catch (err) {
      console.error('Rename session error:', err);
      throw err;
    }
  };

  const handleSaveInlineEdit = async (msgId, newPrompt) => {
    const trimmed = (newPrompt || '').trim();
    if (!trimmed || !activeWorkspaceId || chatLoading) return;

    const msgIndex = chatMessages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    const truncated = chatMessages.slice(0, msgIndex + 1);
    truncated[msgIndex] = { ...truncated[msgIndex], text: trimmed, edited: true };
    setChatMessages(truncated);
    setChatLoading(true);

    try {
      const res = await aiAPI.query(activeWorkspaceId, trimmed, activeSessionId, msgId, selectedDocId);
      const aiText = normalizeAiAnswer(res.data?.answer || 'Response generated.');

      if (res.data?.session_id && res.data.session_id !== activeSessionId) {
        setActiveSessionId(res.data.session_id);
      }

      if (res.data?.user_message?.id) {
        setChatMessages((prev) =>
          prev.map((m, i) => (i === msgIndex ? { ...m, id: res.data.user_message.id } : m))
        );
      }

      setChatMessages((prev) => [
        ...prev,
        { id: res.data?.message?.id || ('ai_' + Date.now()), sender: 'ai', text: aiText }
      ]);

      aiAPI.getSessions(activeWorkspaceId).then((sRes) => {
        if (Array.isArray(sRes.data)) setChatSessions(sRes.data);
      }).catch(() => {});
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK'
          ? 'Could not connect to the AI server. Check backend connection.'
          : (err.message || 'Error processing AI query.'));

      setChatMessages((prev) => [
        ...prev,
        { id: 'ai_err_' + Date.now(), sender: 'ai', text: errorMsg }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleExportTranscript = async () => {
    await exportChatToPdf({
      workspaceName: activeWorkspace?.name || 'Workspace',
      documentsCount: documents.length,
      messages: chatMessages,
      activeDocumentTitle: documents.find((d) => String(d.id) === String(selectedDocId))?.title,
    });
  };

  // ── Layout Theme Variables ──────────────────────────────────────────────────
  const bgMain = isDark ? 'bg-[#0B0F19]' : 'bg-[#F8FAFC]';
  const bgHeader = isDark ? 'bg-[#0D1322]/95' : 'bg-white/95';
  const bgCard = isDark ? 'bg-[#111827]/80' : 'bg-white';
  const bdBase = isDark ? 'border-slate-800' : 'border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const accentText = isDark ? 'text-indigo-400' : 'text-indigo-600';

  return (
    <div className={`min-h-screen h-screen ${bgMain} ${textPrimary} flex flex-col overflow-hidden transition-colors duration-300`}>
      {/* ── Top Navbar ──────────────────────────────────────────────────────── */}
      <header className={`h-16 border-b px-6 flex items-center justify-between shrink-0 z-30 ${bgHeader} backdrop-blur-xl ${bdBase}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${isDark ? 'from-emerald-500 to-emerald-600' : 'from-indigo-500 to-purple-600'} p-[1px] shadow-md`}>
            <div className={`w-full h-full rounded-[11px] ${bgMain} flex items-center justify-center`}>
              <Cpu className={`w-5 h-5 ${accentText}`} />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight">
              AURA AI WORKSPACE
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`hidden sm:flex items-center gap-2 text-xs px-3.5 py-1.5 rounded-xl border ${bgCard} ${bdBase} ${textMuted}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="font-mono text-[11px]">{isConnected ? 'System Active' : 'Disconnected'}</span>
          </div>

          {documents.length > 0 && (
            <div className={`hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${bgCard} ${bdBase} ${accentText}`}>
              <FileText className="w-3.5 h-3.5" />
              <span className="font-semibold">{documents.length} doc{documents.length !== 1 ? 's' : ''}</span>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${bgCard} ${bdBase} ${textMuted} hover:${isDark ? 'text-white' : 'text-slate-900'}`}
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-500" />}
            <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>

          <div className={`flex items-center gap-2 pl-3 border-l ${bdBase}`}>
            {/* User Profile Pill with Hover/Click Popover */}
            <div className="relative group">
              <div
                className={`flex items-center gap-2 p-1.5 md:pr-3 rounded-xl border transition-all text-xs font-semibold ${bgCard} ${bdBase} hover:border-indigo-500/40 cursor-pointer shadow-xs`}
              >
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${isDark ? 'from-emerald-500 to-emerald-600' : 'from-indigo-500 to-purple-600'} text-white flex items-center justify-center font-bold text-xs shadow-sm`}>
                  {(user?.name ? user.name.charAt(0).toUpperCase() : 'U')}
                </div>
                <span className="hidden md:inline font-bold text-slate-800 dark:text-slate-100">
                  {user?.name
                    ? user.name.split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                    : 'User'}
                </span>
              </div>

              {/* Floating Dropdown / Popover Card */}
              <div className="absolute right-0 top-full mt-2 w-64 p-3 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-150 z-50">
                <div className="flex items-center gap-3 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${isDark ? 'from-emerald-500 to-emerald-600' : 'from-indigo-500 to-purple-600'} text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0`}>
                    {(user?.name ? user.name.charAt(0).toUpperCase() : 'U')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {user?.name
                        ? user.name.split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                        : 'User'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email || 'user@workspace.ai'}</div>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">Session Status</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => { logout(); navigate('/'); }}
              title="Logout"
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ───────────────────────────────────────────────── */}
      {dataLoading && workspaces.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" text="Loading AI Workspaces..." />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <WorkspaceSidebar
            isDark={isDark}
            user={user}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            dataLoading={dataLoading}
            onSelectWorkspace={handleSelectWorkspace}
            onCreateWorkspace={handleCreateWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
          />
          <DocumentPanel
            isDark={isDark}
            activeWorkspace={activeWorkspace}
            documents={documents}
            selectedDocId={selectedDocId}
            onSelectDoc={(id) => setSelectedDocId(String(id))}
            onDeleteDoc={handleDeleteDoc}
            onSaveDocumentText={handleSaveDocumentText}
            onUploadFiles={handleUploadFiles}
            onAskAiAboutDoc={handleAskAiAboutDoc}
          />
          <ChatPanel
            isDark={isDark}
            activeWorkspace={activeWorkspace}
            activeDocument={documents.find((d) => String(d.id) === String(selectedDocId)) || null}
            documentsCount={documents.length}
            chatMessages={chatMessages}
            chatSessions={chatSessions}
            activeSessionId={activeSessionId}
            chatLoading={chatLoading}
            onSendMessage={handleSendMessage}
            onNewChat={handleNewChat}
            onSelectSession={handleSelectSession}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
            onSaveInlineEdit={handleSaveInlineEdit}
            onExportTranscript={handleExportTranscript}
          />
        </div>
      )}
    </div>
  );
}
