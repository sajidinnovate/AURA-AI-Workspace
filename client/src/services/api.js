import axios from 'axios';

// Base API instance - all requests go through here
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000',
  timeout: 60000,
});

// Auto-attach JWT token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ── Auth ─────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) =>
    api.post('/api/auth/login', { email, password }),
  register: (name, email, password) =>
    api.post('/api/auth/register', { name, email, password }),
};

// ── Workspaces ────────────────────────────────────────────────────────
export const workspacesAPI = {
  getAll: () => api.get('/api/workspaces'),
  create: (name, description) =>
    api.post('/api/workspaces', { name, description }),
  delete: (id) => api.delete(`/api/workspaces/${id}`),
};

// ── Documents ─────────────────────────────────────────────────────────
export const documentsAPI = {
  getByWorkspace: (workspaceId) =>
    api.get(`/api/documents/${workspaceId}`),
  uploadFile: (workspaceId, file, title) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workspace_id', workspaceId);
    if (title) formData.append('title', title);
    return api.post('/api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  createText: (workspaceId, title, contentText) =>
    api.post('/api/documents', {
      workspace_id: workspaceId,
      title,
      content_text: contentText,
    }),
  delete: (id) => api.delete(`/api/documents/${id}`),
};

// ── AI / Chat ─────────────────────────────────────────────────────────
export const aiAPI = {
  getSessions: (workspaceId) =>
    api.get(`/api/ai/sessions/${workspaceId}`),
  createSession: (workspaceId, title) =>
    api.post('/api/ai/sessions', { workspace_id: workspaceId, title }),
  renameSession: (sessionId, title) =>
    api.patch(`/api/ai/sessions/${sessionId}`, { title }),
  deleteSession: (sessionId) =>
    api.delete(`/api/ai/sessions/${sessionId}`),
  query: (workspaceId, question, sessionId, editMessageId, activeDocumentId) =>
    api.post('/api/ai/query', {
      workspace_id: workspaceId,
      question,
      session_id: sessionId,
      edit_message_id: editMessageId,
      active_document_id: activeDocumentId,
    }),
  getHistory: (workspaceId, sessionId) =>
    api.get(`/api/ai/history/${workspaceId}${sessionId ? `?session_id=${sessionId}` : ''}`),
  clearHistory: (workspaceId, sessionId) =>
    api.delete(`/api/ai/history/${workspaceId}${sessionId ? `?session_id=${sessionId}` : ''}`),
  updateMessage: (id, message) =>
    api.put(`/api/ai/message/${id}`, { message }),
};

export const chatAPI = {
  renameSession: (sessionId, title) =>
    api.patch(`/api/chat/sessions/${sessionId}`, { title }),
};

export default api;
