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
  onDone: (runId?: string, warning?: string) => void,
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
  let lastRunId: string | undefined;
  let lastWarning: string | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (part.startsWith('event: done')) {
        // 解析 data 行获取 runId 和 warning
        const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
        if (dataLine) {
          try {
            const data = JSON.parse(dataLine.replace('data: ', ''));
            lastRunId = data.runId;
            lastWarning = data.warning;
          } catch {
            // 解析失败忽略
          }
        }
        onDone(lastRunId, lastWarning);
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

export const ttsFromLines = async (lines: string[], mode: 'individual' | 'merged' | 'both' = 'both') => {
  return apiFetch<{
    success: boolean;
    data: {
      lines: string[];
      mode: string;
      results: {
        individual?: Array<{ line: string; index: number; tts?: unknown; error?: string }>;
        merged?: { txt: string; tts?: unknown; error?: string };
      };
    };
    debugId?: string;
    debugUrl?: string;
    debugListUrl?: string;
  }>('/api/voice/tts-from-lines', {
    method: 'POST',
    body: JSON.stringify({ lines, mode }),
  });
};

// 文案库 API
export interface CopyLibraryItem {
  id?: number;
  name: string;
  buwei?: string[];
  changping?: string;
  donzuojiexi?: string[];
  erchuanwenan?: string;
  wenan_array_string?: string[];
  wenan_fenxi?: string;
  translated_lines?: string[];
  tts_individual?: Array<{ line: string; index: number; tts?: unknown; error?: string }>;
  tts_merged?: { txt: string; tts?: unknown; error?: string };
  created_at?: string;
  updated_at?: string;
}

export const getCopyLibrary = async () => {
  return apiFetch<{ success: boolean; data: CopyLibraryItem[] }>('/api/copy-library');
};

export const getCopyLibraryItem = async (id: number) => {
  return apiFetch<{ success: boolean; data: CopyLibraryItem }>(`/api/copy-library/${id}`);
};

export const createCopyLibraryItem = async (data: CopyLibraryItem) => {
  return apiFetch<{ success: boolean; data: CopyLibraryItem }>('/api/copy-library', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const updateCopyLibraryItem = async (id: number, data: CopyLibraryItem) => {
  return apiFetch<{ success: boolean; data: CopyLibraryItem }>(`/api/copy-library/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const deleteCopyLibraryItem = async (id: number) => {
  return apiFetch<{ success: boolean; message: string }>(`/api/copy-library/${id}`, {
    method: 'DELETE',
  });
};

// 音频上传 API - 从本地路径上传到 Coze
export const uploadAudioFromLocal = async (filePath: string) => {
  return apiFetch<{
    success: boolean;
    data: {
      file_id: string;
      file_url: string;
      coze_response: unknown;
    };
  }>('/api/audio/upload-local', {
    method: 'POST',
    body: JSON.stringify({ filePath }),
  });
};

// 批量从本地路径上传音频到 Coze
export const batchUploadAudioFromLocal = async (filePaths: string[]) => {
  return apiFetch<{
    success: boolean;
    data: {
      results: Array<{ index: number; filePath: string; file_id?: string; file_url?: string }>;
      errors: Array<{ index: number; filePath: string; error: string }>;
      total: number;
      success_count: number;
      error_count: number;
    };
  }>('/api/audio/batch-upload-local', {
    method: 'POST',
    body: JSON.stringify({ filePaths }),
  });
};