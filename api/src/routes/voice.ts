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
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return '';
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

/** 把 {"output":["..."]} / {"output":"..."} / 纯文本 统一转换为纯文本 */
const unwrapOutputShell = (raw: string): string => {
  const t = raw.trim();

  // 纯 JSON 对象
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      const out = obj.output ?? obj.result ?? obj.text ?? obj.translation ?? obj.content;

      if (Array.isArray(out)) {
        return out.map((x) => String(x).trim()).filter(Boolean).join(' ');
      }
      if (typeof out === 'string') {
        return out.trim();
      }

      const picked = pickTextFromUnknown(obj);
      if (picked) return picked;
    } catch {
      // ignore
    }
  }

  // 纯 JSON 数组
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

/** 处理这种拼接串：{"output":[...]} {"output":[...]} ... */
const stripNestedOutputWrappers = (raw: string): string => {
  const objRegex = /\{[\s\S]*?\}/g;
  const segments = raw.match(objRegex);

  if (!segments || segments.length === 0) {
    return unwrapOutputShell(raw);
  }

  const lines: string[] = [];
  for (const seg of segments) {
    const clean = unwrapOutputShell(seg)
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) lines.push(clean);
  }

  // 如果正则没提取到有效内容，回退原逻辑
  if (!lines.length) return unwrapOutputShell(raw);
  return lines.join('\n');
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

      // 先吃 content
      if (typeof content === 'string' && content.trim()) {
        sentence = stripNestedOutputWrappers(content);
        continue;
      }

      // 再吃直接字段
      const picked = pickTextFromUnknown(dataObj) || pickTextFromUnknown(c);
      if (picked) sentence = stripNestedOutputWrappers(picked);
    }

    sentence = stripNestedOutputWrappers(sentence || line)
      .replace(/\s+/g, ' ')
      .trim();

    out.push(sentence);
  }

  return out;
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

/**
 * 独立英译接口（当前只做这一步）
 * 入参：
 * 1) lines: string[]
 * 2) text: string（product-copy 原始结果，自动提取 wenan_Array_string）
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

export default router;