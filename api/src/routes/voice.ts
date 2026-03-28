import { Router, type Request, type Response } from 'express';
import { authRequired } from '../middleware/auth';
import { config } from '../config';
import { cozeClient } from '../coze';
import { modules } from '../modules';

const router = Router();

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
    if (typeof item === 'string' && item.trim()) {
      return item.trim();
    }
  }
  return '';
};

const normalizeTranslatedText = (raw: string): string => {
  const text = raw.trim();

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const picked = pickTextFromUnknown(obj);
      if (picked) return picked;
    } catch {
      // ignore
    }
  }

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const arr = JSON.parse(text) as unknown[];
      if (arr.length === 1 && typeof arr[0] === 'string') return arr[0].trim();
      return arr.map((x) => String(x)).join(' ').trim();
    } catch {
      // ignore
    }
  }

  return text;
};

const extractWenanArrayOnly = (raw: string): string[] => {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const arr = obj.wenan_Array_string;
    if (Array.isArray(arr)) {
      return arr.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  const match = raw.match(/"wenan_Array_string"\s*:\s*(\[[\s\S]*?\])/);
  if (match?.[1]) {
    try {
      const arr = JSON.parse(match[1]) as unknown[];
      return arr.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // ignore
    }
  }

  return [];
};

const translateLinesToEnglish = async (lines: string[]) => {
  const moduleInfo = modules.translation;
  if (!moduleInfo) throw new Error('翻译模块未配置');

  const out: string[] = [];

  for (const line of lines) {
    const stream = await cozeClient.workflows.runs.stream({
      workflow_id: moduleInfo.workflowId,
      parameters: {
        erchuan_wenan: line,
        language: 'english',
      },
    });

    let sentence = '';

    for await (const chunk of stream) {
      const c = chunk as Record<string, unknown>;
      const dataObj = c.data as Record<string, unknown> | undefined;
      const content = dataObj?.content;

      if (typeof content === 'string' && content.trim()) {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          const picked = pickTextFromUnknown(parsed);
          if (picked) {
            sentence = picked;
            continue;
          }
        } catch {
          sentence = content.trim();
          continue;
        }
      }

      const picked = pickTextFromUnknown(dataObj) || pickTextFromUnknown(c);
      if (picked) sentence = picked;
    }

    sentence = normalizeTranslatedText(sentence || line).replace(/\s+/g, ' ').trim();
    out.push(sentence);
  }

  return out;
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

/**
 * 新功能：只做英译，不做TTS
 * 入参支持两种：
 * 1) lines: string[]         直接传数组
 * 2) text: string            传 product-copy 原始 JSON 字符串（自动提取 wenan_Array_string）
 *
 * 返回：
 * {
 *   sourceLines: string[],
 *   translatedLines: string[],
 *   txt: string   // 一行一句英文
 * }
 */
router.post('/translate-lines', authRequired, async (req: Request, res: Response) => {
  try {
    const { lines, text } = req.body as {
      lines?: string[];
      text?: string;
    };

    let sourceLines: string[] = [];

    if (Array.isArray(lines) && lines.length > 0) {
      sourceLines = lines.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof text === 'string' && text.trim()) {
      sourceLines = extractWenanArrayOnly(text);
    }

    if (!sourceLines.length) {
      return res.status(400).json({
        success: false,
        message: '缺少可翻译内容（请传 lines 或包含 wenan_Array_string 的 text）',
      });
    }

    const translatedLines = await translateLinesToEnglish(sourceLines);
    const txt = buildTxtContent(translatedLines);

    return res.json({
      success: true,
      data: {
        sourceLines,
        translatedLines,
        txt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '英译失败';
    return res.status(500).json({ success: false, message });
  }
});

/**
 * 保留通用代理（后续你接TTS时可继续用）
 */
router.post('/proxy', authRequired, async (req: Request, res: Response) => {
  try {
    const base = getVoiceBaseUrl();
    if (!base) {
      return res.status(500).json({
        success: false,
        message: 'VOICE_BASE_URL 未配置，请检查 api/.env 或 config.ts',
      });
    }

    const { path, payload } = req.body as {
      path?: string;
      payload?: unknown;
    };

    if (!path) {
      return res.status(400).json({ success: false, message: '缺少 path' });
    }

    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });

    const textResp = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        message: textResp || `语音服务返回错误: ${response.status}`,
      });
    }

    try {
      const data = JSON.parse(textResp);
      return res.json({ success: true, data });
    } catch {
      return res.json({ success: true, data: textResp });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音代理调用失败';
    return res.status(500).json({ success: false, message });
  }
});

export default router;