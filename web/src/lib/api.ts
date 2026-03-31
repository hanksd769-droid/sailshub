const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

export const getToken = () => localStorage.getItem('token');
export const setToken = (token: string) => localStorage.setItem('token', token);
export const clearToken = () => localStorage.removeItem('token');

export const apiFetch = async <T>(path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return (await response.json()) as T;
};

/** 给 DetailImagePage 用的上传接口（必须保留） */
export const uploadFile = async (file: File) => {
  const form = new FormData();
  form.append('file', file);

  const token = getToken();
  const response = await fetch(`${API_BASE}/api/files/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return response.json();
};

export const runWorkflowStream = async (
  moduleKey: string,
  parameters: Record<string, unknown>,
  onMessage: (data: unknown) => void,
  onDone: () => void,
  onError: (message: string) => void
) => {
  const token = getToken();
  const response = await fetch(`${API_BASE}/api/runs/${moduleKey}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ parameters }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    onError(text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (part.startsWith('event: done')) {
        onDone();
        continue;
      }

      if (part.startsWith('event: error')) {
        const line = part.split('\n').find((l) => l.startsWith('data: '));
        onError(line ? line.replace('data: ', '') : '运行失败');
        continue;
      }

      if (part.startsWith('data: ')) {
        const json = part.replace('data: ', '');
        try {
          onMessage(JSON.parse(json));
        } catch {
          onMessage(json);
        }
      }
    }
  }
};

export const getVoiceConfig = async () => {
  return apiFetch<{
    success: boolean;
    data: {
      studioUrl: string;
      apiUrl: string;
      baseUrl: string;
    };
  }>('/api/voice/config');
};

export const translateLinesFromCopy = async (text: string) => {
  return apiFetch<{
    success: boolean;
    data: {
      sourceLines: string[];
      translatedLines: string[];
      txt: string;
    };
    debugId?: string;
    debugUrl?: string;
    debugListUrl?: string;
  }>('/api/voice/translate-lines', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
};

export const ttsFromLines = async (lines: string[]) => {
  return apiFetch<{
    success: boolean;
    data: {
      lines: string[];
      txt: string;
      tts: unknown;
    };
    debugId?: string;
    debugUrl?: string;
    debugListUrl?: string;
  }>('/api/voice/tts-from-lines', {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });
};