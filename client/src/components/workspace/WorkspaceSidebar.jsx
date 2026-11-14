import React, { useState } from 'react';
import {
  Layers, Plus, Trash2, RefreshCw, FolderPlus, X, AlertCircle
} from 'lucide-react';

export default function WorkspaceSidebar({
  isDark,
  user,
  workspaces,
  activeWorkspaceId,
  dataLoading,
  onSelectWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
}) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Theme styles
  const bgSidebar = isDark ? 'bg-[#0D1322]/90' : 'bg-white';
  const bgCard = isDark ? 'bg-[#111827]/80' : 'bg-white';
  const bgMain = isDark ? 'bg-[#0B0F19]' : 'bg-[#F8FAFC]';
  const bgInput = isDark ? 'bg-[#0D1322]' : 'bg-slate-50';
  const bdBase = isDark ? 'border-slate-800' : 'border-slate-200';
  const inputBd = isDark
    ? 'border-slate-700/80 focus:border-indigo-500 text-white placeholder-slate-500'
    : 'border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400';
  const accentText = isDark ? 'text-indigo-400' : 'text-indigo-600';
  const accentBg = isDark ? 'bg-indigo-500/10' : 'bg-indigo-50';
  const accentBdLt = isDark ? 'border-indigo-500/30' : 'border-indigo-200';
  const dotColor = isDark ? 'bg-indigo-400' : 'bg-indigo-500';
  const btnGrad = 'from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700';
  const activeWsBg = isDark
    ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/30'
    : 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold shadow-md shadow-indigo-100';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setLoading(true);
    try {
      await onCreateWorkspace(name.trim(), desc.trim());
      setName('');
      setDesc('');
      setShowModal(false);
    } catch (err) {
      setError(err.message || 'Failed to create workspace.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <aside className={`w-56 lg:w-60 border-r flex flex-col shrink-0 ${bgSidebar} backdrop-blur-xl ${bdBase}`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${bdBase}`}>
          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${accentText}`}>
            <Layers className="w-4 h-4" />
            <span>Workspaces</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className={`p-1.5 ${accentBg} hover:opacity-80 border ${accentBdLt} ${accentText} rounded-lg transition-all text-xs flex items-center gap-1 font-semibold`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        {/* Workspace List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {dataLoading ? (
            <div className={`text-center py-6 text-xs ${textMuted}`}>
              <RefreshCw className="w-4 h-4 mx-auto mb-2 animate-spin" />
              Loading...
            </div>
          ) : workspaces.length === 0 ? (
            <div className={`text-center py-6 text-xs ${textMuted}`}>
              <Layers className="w-6 h-6 mx-auto mb-2 opacity-30" />
              No workspaces yet.
            </div>
          ) : (
            workspaces.map((ws) => {
              const isActive = String(ws.id) === String(activeWorkspaceId);
              return (
                <div
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    isActive
                      ? activeWsBg
                      : `${bgCard}/40 ${isDark ? 'border-slate-800 hover:border-indigo-500/20' : 'border-slate-200 hover:border-indigo-200'} ${textMuted}`
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 pr-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? dotColor : 'bg-gray-400'}`} />
                    <div className="truncate">
                      <div className={`text-xs font-semibold truncate ${
                        isActive
                          ? (isDark ? 'text-white' : 'text-indigo-950')
                          : (isDark ? 'text-slate-200' : 'text-slate-800')
                      }`}>{ws.name}</div>
                      {ws.description && (
                        <div className={`text-[10px] truncate leading-tight ${textMuted}`}>{ws.description}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => onDeleteWorkspace(ws.id, e)}
                    className={`${textMuted} hover:text-red-500 p-1 rounded shrink-0 opacity-60 hover:opacity-100 transition-opacity`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Modal: Create Workspace */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${bgCard} ${bdBase}`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FolderPlus className={`w-4 h-4 ${accentText}`} />
                <span>Create Workspace</span>
              </h3>
              <button onClick={() => setShowModal(false)} className={`${textMuted} hover:${isDark ? 'text-white' : 'text-slate-900'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${textMuted}`}>Workspace Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Financial Reports"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2 text-xs border outline-none transition-all ${bgInput} ${inputBd}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${textMuted}`}>Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Brief description..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2 text-xs border outline-none transition-all ${bgInput} ${inputBd}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs border transition-all ${bgMain} ${bdBase} ${textMuted} hover:${isDark ? 'text-white' : 'text-slate-900'}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className={`px-4 py-2 bg-gradient-to-r ${btnGrad} text-white font-semibold rounded-xl text-xs shadow-md disabled:opacity-50`}
                >
                  {loading ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

