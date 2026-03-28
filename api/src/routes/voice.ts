import { Router, type Request, type Response } from 'express';
import { authRequired } from '../middleware/auth';
import { config } from '../config';
import { cozeClient } from '../coze';
import { modules } from '../modules';

const router = Router();

type DebugRecord = {
  id: string;
  createdAt: string;
  input: {
    lines?: string[];
    textPreview?: string;
    extractedLines?: string[];
  };
  steps: Array<{
    step: string;
    payload: unknown;
    at: string;
  }>;
  result?: unknown;
  error?: unknown;
};

const debugStore = new Map<string, DebugRecord>();
const MAX_DEBUG_RECORDS = 50;

const createDebugRecord = (input: DebugRecord['input']) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: DebugRecord = {
    id,
    createdAt: new Date().toISOString(),
    input,
    steps: [],
  };
  debugStore.set(id, record);

  if (debugStore.size > MAX_DEBUG_RECORDS) {
    const firstKey = debugStore.keys().next().value as string | undefined;
    if (firstKey) debugStore.delete(firstKey);
  }

  return record;
};

const appendDebugStep = (record: DebugRecord, step: string, payload: unknown) => {
  const item = { step, payload, at: new Date().toISOString() };
  record.steps.push(item);
  try {
    console.log(`[voice-debug][${record.id}][${step}]`, JSON.stringify(payload, null, 2));
  } catch {
    console.log(`[voice-debug][${record.id}][${step}]`, payload);
  }
};

const getVoiceBaseUrl = () => {
  const raw = config.voiceBaseUrl || process.env.VOICE_BASE_URL;
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
};

router.get('/config', authRequired, (_req: Request, res: Response) => {
  const base = getVoiceBaseUrl();
  if (!base) {
    return res.status(500).json({
      success: false,
      message: 'VOICE_BASE_URL 未配置，请检查 api/.env 或 config.ts',
    });
  }

  return res.json({
    success: true,
    data: {
      studioUrl: `${base}/?__theme=dark`,
      apiUrl: `${base}/?__theme=dark&view=api`,
      baseUrl: base,
    },
  });
});

const pickTextFromUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const obj = value as Record<string, unknown>;
  const candidates = [obj.output, obj.result, obj.text, obj.content, obj.translation];

  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return '';
};

const flattenToLines = (arr: unknown[]): string[] =>
  arr.map((x) => String(x).trim()).filter(Boolean);

const extractWenanArrayOnly = (raw: string): string[] => {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const value = obj.wenan_Array_string;

    if (Array.isArray(value)) return flattenToLines(value);

    if (typeof value === 'string') {
      const v = value.trim();
      if (v.startsWith('[') && v.endsWith(']')) {
        try {
          const arr = JSON.parse(v) as unknown[];
          if (Array.isArray(arr)) return flattenToLines(arr);
        } catch {
          // ignore
        }
      }

      return v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // ignore
  }

  const m = raw.match(/"wenan_Array_string"\s*:\s*("(\[[\s\S]*?\])"|(\[[\s\S]*?\]))/);
  if (m) {
    const rawVal = (m[2] ?? m[3] ?? '').trim();
    if (rawVal) {
      try {
        const arr = JSON.parse(rawVal) as unknown[];
        if (Array.isArray(arr)) return flattenToLines(arr);
      } catch {
        // ignore
      }
    }
  }

  return [];
};

const unwrapOutputShell = (raw: string): string => {
  const t = raw.trim();

  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      const out = obj.output ?? obj.result ?? obj.text ?? obj.translation ?? obj.content;

      if (Array.isArray(out)) return out.map((x) => String(x).trim()).filter(Boolean).join(' ');
      if (typeof out === 'string') return out.trim();

      const picked = pickTextFromUnknown(obj);
      if (picked) return picked;
    } catch {
      // ignore
    }
  }

  if (t.startsWith('[') && t.endsWith(']')) {
    try {
      const arr = JSON.parse(t) as unknown[];
      return arr.map((x) => String(x).trim()).filter(Boolean).join(' ');
    } catch {
      // ignore
    }
  }

  return t;
};

const hasChinese = (s: string) => /[\u4e00-\u9fff]/.test(s);

const extractEnglishChunks = (s: string) => {
  const chunks = s.match(/[A-Za-z0-9][A-Za-z0-9 ,.';:!?()\-]*/g) || [];
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
};

const translateLinesToEnglish = async (lines: string[], record: DebugRecord) => {
  const moduleInfo = modules.translation;
  if (!moduleInfo) throw new Error('翻译模块未配置');

  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    appendDebugStep(record, 'translate_line_input', { index: i, line });

    const stream = await cozeClient.workflows.runs.stream({
      workflow_id: moduleInfo.workflowId,
      parameters: {
        erchuan_wenan: line,
        language: 'english',
      },
    });

    const rawChunks: unknown[] = [];
    let sentence = '';

    for await (const chunk of stream) {
      rawChunks.push(chunk);
      const c = chunk as Record<string, unknown>;
      const dataObj = c.data as Record<string, unknown> | undefined;
      const content = dataObj?.content;

      if (typeof content === 'string' && content.trim()) {
        sentence = unwrapOutputShell(content);
        continue;
      }

      const picked = pickTextFromUnknown(dataObj) || pickTextFromUnknown(c);
      if (picked) sentence = unwrapOutputShell(picked);
    }

    appendDebugStep(record, 'translate_line_raw_chunks', { index: i, chunks: rawChunks });

    sentence = unwrapOutputShell(sentence).replace(/\s+/g, ' ').trim();
    if (!sentence) sentence = line.trim();

    if (hasChinese(sentence)) {
      const englishOnly = extractEnglishChunks(sentence);
      if (englishOnly) sentence = englishOnly;
    }

    appendDebugStep(record, 'translate_line_output', { index: i, sentence });
    out.push(sentence);
  }

  return out;
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

router.get('/debug/:id', authRequired, (req: Request, res: Response) => {
  const record = debugStore.get(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'debug 记录不存在' });
  }
  return res.json({ success: true, data: record });
});

router.get('/debug', authRequired, (_req: Request, res: Response) => {
  const list = Array.from(debugStore.values()).map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    linesCount: r.input.extractedLines?.length ?? r.input.lines?.length ?? 0,
    hasError: Boolean(r.error),
  }));

  return res.json({ success: true, data: list });
});

router.post('/translate-lines', authRequired, async (req: Request, res: Response) => {
  const { lines, text } = req.body as {
    lines?: string[];
    text?: string;
  };

  const record = createDebugRecord({
    lines,
    textPreview: typeof text === 'string' ? text.slice(0, 1200) : undefined,
  });

  try {
    let sourceLines: string[] = [];

    if (Array.isArray(lines) && lines.length > 0) {
      sourceLines = lines.map((x) => String(x).trim()).filter(Boolean);
      appendDebugStep(record, 'source_from_lines', sourceLines);
    } else if (typeof text === 'string' && text.trim()) {
      sourceLines = extractWenanArrayOnly(text);
      appendDebugStep(record, 'source_from_text_extracted', sourceLines);
    }

    record.input.extractedLines = sourceLines;

    if (!sourceLines.length) {
      const errorPayload = {
        message: '未从文案结果中提取到 wenan_Array_string',
        hint: '请检查 product-copy 输出是否包含 wenan_Array_string',
      };
      record.error = errorPayload;
      appendDebugStep(record, 'error', errorPayload);
      return res.status(400).json({
        success: false,
        message: errorPayload.message,
        debugId: record.id,
        debugUrl: `/api/voice/debug/${record.id}`,
      });
    }

    const translatedLines = await translateLinesToEnglish(sourceLines, record);
    const txt = buildTxtContent(translatedLines);

    const result = {
      sourceLines,
      translatedLines,
      txt,
    };

    record.result = result;
    appendDebugStep(record, 'final_result', result);

    return res.json({
      success: true,
      data: result,
      debugId: record.id,
      debugUrl: `/api/voice/debug/${record.id}`,
      debugListUrl: '/api/voice/debug',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '英译失败';
    const errorPayload = {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    };

    record.error = errorPayload;
    appendDebugStep(record, 'error', errorPayload);

    return res.status(500).json({
      success: false,
      message,
      debugId: record.id,
      debugUrl: `/api/voice/debug/${record.id}`,
      debugListUrl: '/api/voice/debug',
    });
  }
});

export default router;
