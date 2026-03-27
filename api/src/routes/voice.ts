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
  const response = await fetch(`${base}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [value], api_name: apiName }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`调用 ${apiName} 失败: ${text || response.status}`);
  }

  return response.json();
};

const callTtsBatch = async (base: string, fileBuffer: Buffer, filename: string) => {
  // 1) 设置批量处理
  await callPredict(base, '/lambda', true);

  // 2) 设置导出 SRT
  await callPredict(base, '/lambda_1', true);

  // 3) 上传 TXT 文件到 gradio
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: 'text/plain' });
  form.append('files', blob, filename);

  const uploadResp = await fetch(`${base}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`上传 TXT 失败: ${text || uploadResp.status}`);
  }

  const uploadData = await uploadResp.json();

  // 4) 绑定上传文件到“上传TXT、SRT文件”组件
  const bindFileResp = await fetch(`${base}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [uploadData], api_name: '/lambda_2' }),
  });

  if (!bindFileResp.ok) {
    const text = await bindFileResp.text();
    throw new Error(`绑定上传文件失败: ${text || bindFileResp.status}`);
  }

  // 5) 执行生成
  const generateResp = await fetch(`${base}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [], api_name: '/generate_audio' }),
  });

  if (!generateResp.ok) {
    const text = await generateResp.text();
    throw new Error(`语音生成失败: ${text || generateResp.status}`);
  }

  return generateResp.json();
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