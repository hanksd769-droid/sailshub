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

const flattenToLines = (arr: unknown[]): string[] =>
  arr.map((x) => String(x).trim()).filter(Boolean);

/** 只提取 wenan_Array_string，兼容：
 * 1) wenan_Array_string: string[]
 * 2) wenan_Array_string: "[\"...\",\"...\"]"
 */
const extractWenanArrayOnly = (raw: string): string[] => {
  // 方案A：整体 JSON 可解析
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const value = obj.wenan_Array_string;

    if (Array.isArray(value)) {
      return flattenToLines(value);
    }

    if (typeof value === 'string') {
      const v = value.trim();

      // 字符串里是 JSON 数组
      if (v.startsWith('[') && v.endsWith(']')) {
        try {
          const arr = JSON.parse(v) as unknown[];
          if (Array.isArray(arr)) return flattenToLines(arr);
        } catch {
          // ignore
        }
      }

      // 兜底：按换行拆
      return v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // ignore
  }

  // 方案B：从原始串抓 wenan_Array_string 的值
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

  // {"output":"..."} / {"output":["..."]} / {"result":"..."}
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

  // ["..."]
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

/** 每句单独翻译，返回纯英文行 */
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

      // 优先 content
      if (typeof content === 'string' && content.trim()) {
        sentence = unwrapOutputShell(content);
        continue;
      }

      // 其次直接字段
      const picked = pickTextFromUnknown(dataObj) || pickTextFromUnknown(c);
      if (picked) sentence = unwrapOutputShell(picked);
    }

    sentence = unwrapOutputShell(sentence).replace(/\s+/g, ' ').trim();

    // 如果仍为空，回退原句；如果含中文，优先拿最后一段英文
    if (!sentence) sentence = line.trim();

    if (hasChinese(sentence)) {
      // 提取连续英文片段作为兜底
      const englishChunks = sentence.match(/[A-Za-z0-9][A-Za-z0-9 ,.';:!?()-]*/g) || [];
      const merged = englishChunks.join(' ').replace(/\s+/g, ' ').trim();
      if (merged) sentence = merged;
    }

    out.push(sentence);
  }

  return out;
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

/**
 * 独立英译接口
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
        message: '未从文案结果中提取到 wenan_Array_string',
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