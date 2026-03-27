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

/** 前端读取语音服务配置（用于显示按钮） */
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

const splitSentences = (text: string) => {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n|(?<=[。！？!?])\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

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

const getTranslationText = async (text: string) => {
  const moduleInfo = modules.translation;
  if (!moduleInfo) {
    throw new Error('翻译模块未配置，请先在 modules.ts 增加 translation');
  }

  const stream = await cozeClient.workflows.runs.stream({
    workflow_id: moduleInfo.workflowId,
    parameters: {
      erchuan_wenan: text,
      language: 'english',
    },
  });

  let output = '';

  for await (const chunk of stream) {
    const c = chunk as Record<string, unknown>;

    output = output || pickTextFromUnknown(c.data) || pickTextFromUnknown(c);

    const content = (c.data as Record<string, unknown> | undefined)?.content;
    if (!output && typeof content === 'string' && content.trim()) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        output = pickTextFromUnknown(parsed) || content.trim();
      } catch {
        output = content.trim();
      }
    }
  }

  // 翻译拿不到时回退原文，保证后续 TTS 不中断
  return output || text;
};

const callPredict = async (base: string, apiName: string, value: unknown) => {
  const normalized = apiName.startsWith('/') ? apiName.slice(1) : apiName;
  const namesToTry = [apiName, normalized];
  const pathsToTry = ['/predict', '/run/predict', '/api/predict'];

  let lastErr = '';

  for (const path of pathsToTry) {
    for (const name of namesToTry) {
      try {
        const response = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: [value], api_name: name }),
        });

        const text = await response.text();
        if (!response.ok) {
          lastErr = `${path} api_name=${name} -> ${text || response.status}`;
          continue;
        }

        try {
          return JSON.parse(text);
        } catch {
          return { data: text };
        }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
  }

  throw new Error(`调用 ${apiName} 失败: ${lastErr || 'No compatible endpoint found'}`);
};

const callGenerateAudio = async (base: string) => {
  const pathsToTry = ['/predict', '/run/predict', '/api/predict'];
  let lastErr = '';

  for (const path of pathsToTry) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [], api_name: '/generate_audio' }),
      });

      const text = await response.text();
      if (!response.ok) {
        lastErr = `${path} /generate_audio -> ${text || response.status}`;
        continue;
      }

      try {
        return JSON.parse(text);
      } catch {
        return { data: text };
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`调用 /generate_audio 失败: ${lastErr || 'No compatible endpoint found'}`);
};

const uploadTxtFile = async (base: string, fileBuffer: Buffer, filename: string) => {
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: 'text/plain' });
  // 你文档里是单文件 value；字段名这里尝试 files
  form.append('files', blob, filename);

  const response = await fetch(`${base}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`上传 TXT 失败: ${text || response.status}`);
  }

  return response.json();
};

const callTtsBatch = async (base: string, fileBuffer: Buffer, filename: string) => {
  // 1) 打开批量处理
  await callPredict(base, '/lambda', true);

  // 2) 打开导出SRT
  await callPredict(base, '/lambda_1', true);

  // 3) 上传TXT
  const uploadData = await uploadTxtFile(base, fileBuffer, filename);

  // 4) 把上传结果绑定到“上传TXT、SRT文件”
  await callPredict(base, '/lambda_2', uploadData);

  // 5) 执行生成
  return callGenerateAudio(base);
};

/** 文案 -> 英译 -> 逐句TXT -> TTS批量+SRT */
router.post('/generate-from-copy', authRequired, async (req: Request, res: Response) => {
  try {
    const base = getVoiceBaseUrl();
    if (!base) {
      return res.status(500).json({
        success: false,
        message: 'VOICE_BASE_URL 未配置，请检查 api/.env 或 config.ts',
      });
    }

    const { text } = req.body as { text?: string };
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: '缺少文案内容' });
    }

    const translated = await getTranslationText(text);
    const lines = splitSentences(translated);
    const txtContent = buildTxtContent(lines);

    const txtBuffer = Buffer.from(txtContent, 'utf-8');
    const filename = `voice-${Date.now()}.txt`;

    const tts = await callTtsBatch(base, txtBuffer, filename);

    return res.json({
      success: true,
      data: {
        translated,
        lines,
        txt: txtContent,
        tts,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音生成失败';
    return res.status(500).json({ success: false, message });
  }
});

/** 通用代理（用于调试任意 api_name） */
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

    const text = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        message: text || `语音服务返回错误: ${response.status}`,
      });
    }

    try {
      const data = JSON.parse(text);
      return res.json({ success: true, data });
    } catch {
      return res.json({ success: true, data: text });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音代理调用失败';
    return res.status(500).json({ success: false, message });
  }
});

export default router;