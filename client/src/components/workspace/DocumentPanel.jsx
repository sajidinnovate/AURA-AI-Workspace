import React, { useState, useRef } from 'react';
import {
  BookOpen, Plus, Search, FileText, Trash2, Sparkles, X,
  FilePlus2, FileUp, PenLine, Files, UploadCloud, CheckCircle2, AlertCircle
} from 'lucide-react';

export function DocTypeBadge({ title = '', size = 'sm' }) {
  const ext = (title || '').toLowerCase();
  let label = 'FILE';
  let color = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600/50';

  if (ext.endsWith('.pdf')) {
    label = 'PDF';
    color = 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30';
  } else if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
    label = 'DOCX';
    color = 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30';
  } else if (ext.endsWith('.pptx') || ext.endsWith('.ppt')) {
    label = 'PPTX';
    color = 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30';
  } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
    label = 'EXCEL';
    color = 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30';
  } else if (ext.endsWith('.txt') || ext.endsWith('.md')) {
    label = 'TXT';
    color = 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30';
  }

  return (
    <span
      className={`inline-flex items-center font-mono font-bold tracking-wider rounded border ${color} ${
        size === 'lg' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'
      }`}
    >
      {label}
    </span>
  );
}

export function DocumentContentReader({ contentText }) {
  if (!contentText) return <span>No content extracted.</span>;

  // Split on --- Page/Slide/Sheet X --- markers while preserving the delimiter
  const pageRegex = /---\s*((?:Page|Slide|Sheet:?)\s*[^-\n]+)\s*---/gi;
  const parts = contentText.split(pageRegex);

  // If there are no page markers, render text directly
  if (parts.length <= 1) {
    return <div className="whitespace-pre-wrap">{contentText}</div>;
  }

  const elements = [];
  if (parts[0] && parts[0].trim()) {
    elements.push(
      <div key="page-lead" className="whitespace-pre-wrap mb-4">
        {parts[0].trim()}
      </div>
    );
  }

  for (let i = 1; i < parts.length; i += 2) {
    const pageLabel = parts[i].trim();
    const pageBody = parts[i + 1] ? parts[i + 1].trim() : '';

    elements.push(
      <div key={`page-segment-${i}`} className="my-5 first:mt-1">
        <div className="flex items-center gap-3 my-3 select-none">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 shadow-2xs">
            {pageLabel}
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>
        {pageBody && (
          <div className="whitespace-pre-wrap leading-relaxed mt-2">
            {pageBody}
          </div>
        )}
      </div>
    );
  }

  return <div>{elements}</div>;
}

export default function DocumentPanel({
  isDark,
  activeWorkspace,
  documents,
  selectedDocId,
  onSelectDoc,
  onDeleteDoc,
  onSaveDocumentText,
  onUploadFiles,
  onAskAiAboutDoc,
}) {
  const [docSearch, setDocSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('upload'); // 'upload' | 'text'
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [docError, setDocError] = useState('');
  const fileInputRef = useRef(null);

  // Theme styles
  const bgMain = isDark ? 'bg-[#0B0F19]' : 'bg-[#F8FAFC]';
  const bgCard = isDark ? 'bg-[#111827]/80' : 'bg-white';
  const bgInput = isDark ? 'bg-[#0D1322]' : 'bg-slate-50';
  const bdBase = isDark ? 'border-slate-800' : 'border-slate-200';
  const inputBd = isDark
    ? 'border-slate-700/80 focus:border-indigo-500 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/20'
    : 'border-slate-200 focus:border-indigo-500 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20';
  const accentText = isDark ? 'text-indigo-400' : 'text-indigo-600';
  const accentBg = isDark ? 'bg-indigo-500/10' : 'bg-indigo-50';
  const accentBd = isDark ? 'border-indigo-500' : 'border-indigo-500';
  const accentBdLt = isDark ? 'border-indigo-500/30' : 'border-indigo-200';
  const btnGrad = 'from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-500/25';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  const activeDocument = documents.find((d) => String(d.id) === String(selectedDocId)) || null;

  const filteredDocs = documents.filter((d) =>
    d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
    (d.content_text || '').toLowerCase().includes(docSearch.toLowerCase())
  );

  const openModal = () => {
    setDocTitle('');
    setDocContent('');
    setSelectedFiles([]);
    setDragOver(false);
    setModalTab('upload');
    setDocError('');
    setUploadProgress({ current: 0, total: 0 });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (uploading) return;
    setDocError('');
    setUploading(true);

    try {
      if (modalTab === 'text') {
        if (!docTitle.trim()) { setUploading(false); return; }
        await onSaveDocumentText(docTitle.trim(), docContent.trim());
        setShowModal(false);
      } else {
        if (selectedFiles.length === 0) { setUploading(false); return; }
        setUploadProgress({ current: 0, total: selectedFiles.length });

        const failed = await onUploadFiles(
          selectedFiles,
          docTitle.trim(),
          (curr, tot) => setUploadProgress({ current: curr, total: tot })
        );

        if (failed && failed.length > 0) {
          setDocError(`Some files could not be processed: ${failed.join('; ')}`);
          return;
        }

        setShowModal(false);
      }
    } catch (err) {
      setDocError(err.message || 'Failed to save document(s).');
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  return (
    <>
      <section className={`flex-1 border-r flex flex-col overflow-hidden ${bgMain} ${bdBase}`}>
        {/* Section Header */}
        <div className={`p-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 ${bgCard}/40 ${bdBase}`}>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <BookOpen className={`w-4 h-4 ${accentText}`} />
              <span>{activeWorkspace?.name || 'Select a Workspace'}</span>
            </h2>
            <p className={`text-xs ${textMuted}`}>
              {documents.length > 0
                ? `${documents.length} document${documents.length !== 1 ? 's' : ''} in knowledge base`
                : 'Upload documents to get started'}
            </p>
          </div>
          <button
            onClick={openModal}
            disabled={!activeWorkspace}
            className={`bg-gradient-to-r ${btnGrad} disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md hover:-translate-y-0.5 active:translate-y-0`}
          >
            <Plus className="w-4 h-4" />
            <span>Add Document</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className={`p-3 border-b flex items-center gap-2 shrink-0 ${bgCard}/20 ${bdBase}`}>
          <div className="relative flex-1">
            <Search className={`w-4 h-4 absolute left-3 top-2.5 ${textMuted}`} />
            <input
              type="text"
              placeholder="Search documents..."
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              className={`w-full rounded-xl pl-9 pr-4 py-2 text-xs border transition-all outline-none ${bgInput} ${inputBd}`}
            />
          </div>
        </div>

        {/* Document List & Document Viewer */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Document List */}
          <div className={`w-full md:w-60 lg:w-64 border-b md:border-b-0 md:border-r overflow-y-auto p-3 space-y-2 shrink-0 ${bgCard}/10 ${bdBase}`}>
            {!activeWorkspace ? (
              <div className={`text-center py-12 text-xs ${textMuted}`}>
                Select or create a workspace first.
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className={`text-center py-8 text-xs ${textMuted}`}>
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                {docSearch ? 'No matching documents.' : 'No documents yet. Click "+ Add Document"'}
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isSel = String(doc.id) === String(selectedDocId);
                return (
                  <div
                    key={doc.id}
                    onClick={() => onSelectDoc(String(doc.id))}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSel
                        ? `${bgCard} ${accentBd} ${textPrimary} shadow-md`
                        : `${bgCard}/50 ${isDark ? 'border-slate-800 hover:border-indigo-500/20' : 'border-slate-200 hover:border-indigo-200'} ${textMuted}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-2 truncate">
                        <DocTypeBadge title={doc.title} />
                        <span className={`text-xs font-semibold truncate ${
                          isSel
                            ? textPrimary
                            : isDark ? 'text-slate-200' : 'text-slate-800'
                        }`}>{doc.title}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDoc(doc.id);
                        }}
                        className={`${textMuted} hover:text-red-500 p-1 rounded shrink-0`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className={`text-[11px] line-clamp-2 leading-relaxed ${textMuted}`}>
                      {doc.content_text ? doc.content_text.slice(0, 100) + '...' : 'No content preview.'}
                    </p>
                    <div className={`mt-2 text-[10px] font-mono ${textMuted}`}>
                      {doc.content_text ? `~${Math.ceil(doc.content_text.length / 5)} words` : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Active Document Viewer */}
          <div className={`flex-1 p-5 overflow-y-auto flex flex-col ${bgMain}`}>
            {activeDocument ? (
              <div className="flex-1 flex flex-col space-y-4">
                <div className={`flex items-center justify-between pb-3.5 border-b ${bdBase}`}>
                  <div className="flex items-center gap-2.5">
                    <DocTypeBadge title={activeDocument.title} size="lg" />
                    <div>
                      <h3 className="text-sm font-bold">{activeDocument.title}</h3>
                      <span className={`text-[10px] font-mono ${textMuted}`}>
                        {activeDocument.content_text
                          ? `${activeDocument.content_text.length.toLocaleString()} chars`
                          : ''}{' '}
                        • Vector RAG Indexed
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onAskAiAboutDoc(activeDocument.title)}
                    className={`px-3.5 py-1.5 ${accentBg} border ${accentBdLt} ${accentText} hover:opacity-80 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ask AI About This</span>
                  </button>
                </div>
                <div
                  className={`flex-1 p-5 border rounded-xl text-xs font-mono leading-relaxed overflow-y-auto ${
                    bgCard
                  }/80 ${bdBase} ${isDark ? 'text-gray-200' : 'text-slate-800'}`}
                >
                  <DocumentContentReader contentText={activeDocument.content_text} />
                </div>
              </div>
            ) : (
              <div className={`flex-1 flex flex-col items-center justify-center text-center p-6 ${textMuted}`}>
                <FileText className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-semibold">No Document Selected</p>
                <p className={`text-xs mt-1 ${textMuted}`}>Select a document from the list or upload a new one.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Modal: Add Document */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl border ${bgCard} ${bdBase} overflow-hidden`}>
            {/* Modal Header */}
            <div className={`px-6 pt-6 pb-4 border-b ${bdBase}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FilePlus2 className={`w-4 h-4 ${accentText}`} />
                  <span>Add to {activeWorkspace?.name || 'Workspace'}</span>
                </h3>
                <button onClick={() => setShowModal(false)} className={`${textMuted} hover:${isDark ? 'text-white' : 'text-slate-900'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className={`flex gap-1 p-1 rounded-xl ${bgMain}`}>
                {[
                  { key: 'upload', label: 'Upload File', icon: <FileUp className="w-3.5 h-3.5" /> },
                  { key: 'text', label: 'Plain Text', icon: <PenLine className="w-3.5 h-3.5" /> },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setModalTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                      modalTab === tab.key
                        ? `${bgCard} ${accentText} shadow-sm border ${bdBase}`
                        : textMuted
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {modalTab === 'upload' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md,.markdown,.json"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        setSelectedFiles((prev) => [...prev, ...files]);
                      }
                      e.target.value = '';
                    }}
                  />

                  {selectedFiles.length > 0 ? (
                    <div className="space-y-3">
                      <div className={`flex items-center justify-between p-2.5 rounded-xl border ${bdBase} ${bgMain}`}>
                        <div className="flex items-center gap-2">
                          <Files className={`w-4 h-4 ${accentText}`} />
                          <span className={`text-xs font-bold ${textPrimary}`}>
                            {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                          </span>
                          <span className={`text-[11px] ${textMuted}`}>
                            &bull;{' '}
                            {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB total
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={`text-xs font-semibold px-2 py-1 rounded-lg border ${accentBdLt} ${accentText} ${accentBg} hover:opacity-80 transition-all flex items-center gap-1`}
                          >
                            <FilePlus2 className="w-3 h-3" />
                            <span>Add More</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles([])}
                            className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-all px-1.5 py-1"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      {/* File List */}
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {selectedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2.5 rounded-xl border ${bdBase} ${bgCard} transition-all hover:border-indigo-500/30`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <DocTypeBadge title={file.name} size="sm" />
                              <div className="min-w-0">
                                <p className={`text-xs font-semibold truncate ${textPrimary}`} title={file.name}>
                                  {file.name}
                                </p>
                                <p className={`text-[10px] ${textMuted}`}>
                                  {(file.size / 1024).toFixed(1)} KB &bull; Vector RAG Ready
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 transition-all ml-2 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {selectedFiles.length === 1 ? (
                        <div>
                          <label className={`block text-xs font-bold uppercase mb-1.5 ${textMuted}`}>
                            Document Title (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="Defaults to filename"
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                            className={`w-full rounded-xl px-3.5 py-2 text-xs border outline-none transition-all ${bgInput} ${inputBd}`}
                          />
                        </div>
                      ) : (
                        <div className={`p-2.5 rounded-xl border ${bdBase} ${bgMain} text-[11px] ${textMuted} flex items-center gap-2`}>
                          <span className={`font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>ℹ️ Note:</span>
                          <span>Titles for multiple files will default to original filenames automatically.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const dropped = Array.from(e.dataTransfer.files || []);
                        if (dropped.length > 0) setSelectedFiles((prev) => [...prev, ...dropped]);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                        dragOver
                          ? isDark ? 'border-emerald-400 bg-emerald-500/5' : 'border-indigo-500 bg-indigo-500/5'
                          : isDark ? 'border-slate-800 hover:border-indigo-500/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50'
                      }`}
                    >
                      <div className="space-y-3">
                        <UploadCloud className={`w-10 h-10 mx-auto ${textMuted} opacity-60`} />
                        <div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>Drop multiple files here or click to browse</p>
                          <p className={`text-xs mt-1 ${textMuted}`}>
                            Supports PDF, Word (DOCX), Excel (XLSX/CSV), PPTX, and TXT
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {['PDF', 'DOCX', 'EXCEL/CSV', 'PPTX', 'TXT'].map((t) => (
                            <span
                              key={t}
                              className={`text-[10px] px-2 py-0.5 rounded border ${accentBg} ${accentBdLt} ${accentText} font-mono font-bold`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {modalTab === 'text' && (
                <>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${textMuted}`}>Document Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Project Specifications"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      className={`w-full rounded-xl px-3.5 py-2 text-xs border outline-none transition-all ${bgInput} ${inputBd}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase mb-1.5 ${textMuted}`}>Content *</label>
                    <textarea
                      rows={7}
                      required
                      placeholder="Paste or type document content..."
                      value={docContent}
                      onChange={(e) => setDocContent(e.target.value)}
                      className={`w-full rounded-xl p-3.5 text-xs font-mono leading-relaxed border outline-none transition-all resize-none ${bgInput} ${inputBd}`}
                    />
                  </div>
                </>
              )}

              {docError && (
                <div className="rounded-xl border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-3 text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400" />
                  <span>{docError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs border transition-all ${bgMain} ${bdBase} ${textMuted} hover:${isDark ? 'text-white' : 'text-slate-900'}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    uploading ||
                    (modalTab === 'upload' && selectedFiles.length === 0) ||
                    (modalTab === 'text' && !docTitle.trim())
                  }
                  className={`px-5 py-2 bg-gradient-to-r ${btnGrad} text-white font-semibold rounded-xl text-xs shadow-md flex items-center gap-2 disabled:opacity-40 transition-all`}
                >
                  {uploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>
                        {uploadProgress.total > 1
                          ? `Vectorizing (${uploadProgress.current}/${uploadProgress.total})...`
                          : 'Vectorizing & Saving...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {modalTab === 'upload' && selectedFiles.length > 1
                          ? `Upload ${selectedFiles.length} Documents`
                          : 'Save Document'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

