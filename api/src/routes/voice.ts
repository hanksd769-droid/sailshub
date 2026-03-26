import { Router, type Request, type Response } from 'express';
import FormData from 'form-data';
import { authRequired } from '../middleware/auth';
import { config } from '../config';
import { cozeClient } from '../coze';
import { modules } from '../modules';

const router = Router();

const getVoiceBaseUrl = () => {
  // 兼容旧代码未更新 config.ts 的情况，优先读 config，再兜底读 process.env
  const raw = config.voiceBaseUrl || process.env.VOICE_BASE_URL;
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
};

/** 前端读取语音服务配置（用于显示按钮/iframe） */
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

const getTranslationText = async (text: string) => {
  const moduleInfo = modules.translation;
  if (!moduleInfo) {
    throw new Error('翻译模块未配置');
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
    const maybeEvent = chunk as { event?: string; data?: { content?: string } };
    if (maybeEvent.event === 'Message' && maybeEvent.data?.content) {
      try {
        const parsed = JSON.parse(maybeEvent.data.content) as {
          output?: string;
          result?: string;
          text?: string;
        };
        output = parsed.output || parsed.result || parsed.text || maybeEvent.data.content;
      } catch {
        output = maybeEvent.data.content;
      }
    }
  }

  if (!output) {
    throw new Error('翻译服务未返回内容');
  }

  return output;
};

const callTtsBatch = async (base: string, fileBuffer: Buffer, filename: string) => {
  const form = new FormData();
  form.append('files', fileBuffer, { filename });

  const response = await fetch(`${base}/upload`, {
    method: 'POST',
    headers: {
      ...form.getHeaders(),
    },
    body: form as unknown as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '上传 txt 失败');
  }

  const uploadData = await response.json();

  const predictPayload = {
    data: [
      true,
      uploadData,
      true,
      true,
      true,
    ],
  };

  const predictRes = await fetch(`${base}/run/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(predictPayload),
  });

  if (!predictRes.ok) {
    const text = await predictRes.text();
    throw new Error(text || '语音生成失败');
  }

  return predictRes.json();
};

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
    if (!text) {
      return res.status(400).json({ success: false, message: '缺少文案内容' });
    }

    const translated = await getTranslationText(text);
    const lines = splitSentences(translated);
    const txtContent = buildTxtContent(lines);

    const txtBuffer = Buffer.from(txtContent, 'utf-8');
    const filename = `voice-${Date.now()}.txt`;

    const ttsResponse = await callTtsBatch(base, txtBuffer, filename);

    return res.json({
      success: true,
      data: {
        translated,
        lines,
        txt: txtContent,
        tts: ttsResponse,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音生成失败';
    return res.status(500).json({ success: false, message });
  }
});

/**
 * 服务器端代理调用 TTS API
 * path 示例：/run/predict 或 gradio API Recorder 生成的实际 path
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