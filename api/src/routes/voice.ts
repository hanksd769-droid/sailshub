import { Router, type Request, type Response } from 'express';
import { authRequired } from '../middleware/auth';
import { config } from '../config';
import { cozeClient } from '../coze';
import { modules } from '../modules';
import { Client, handle_file } from '@gradio/client';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

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
  if (!moduleInfo) {
    throw new Error('翻译模块未配置，请先在 modules.ts 增加 translation');
  }

  const translatedLines: string[] = [];

  for (const line of lines) {
    const stream = await cozeClient.workflows.runs.stream({
      workflow_id: moduleInfo.workflowId,
      parameters: {
        erchuan_wenan: line,
        language: 'english',
      },
    });

    let translated = '';

    for await (const chunk of stream) {
      const c = chunk as Record<string, unknown>;
      const direct = pickTextFromUnknown(c.data) || pickTextFromUnknown(c);
      if (direct) translated = direct;

      const content = (c.data as Record<string, unknown> | undefined)?.content;
      if (!translated && typeof content === 'string' && content.trim()) {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          translated = pickTextFromUnknown(parsed) || content.trim();
        } catch {
          translated = content.trim();
        }
      }
    }

    translatedLines.push(normalizeTranslatedText(translated || line));
  }

  return translatedLines;
};

const callTtsBatch = async (base: string, txtContent: string) => {
  const client = await Client.connect(base);

  const tmpFile = path.join(os.tmpdir(), `voice-${Date.now()}.txt`);
  await fs.writeFile(tmpFile, txtContent, 'utf-8');

  const logStep = (step: string, payload: unknown) => {
    try {
      console.log(`[voice][${step}]`, JSON.stringify(payload, null, 2));
    } catch {
      console.log(`[voice][${step}]`, payload);
    }
  };

  try {
    logStep('start', { base, tmpFile, txtPreview: txtContent.slice(0, 300) });

    // 按 API Recorder 的流程执行（取最终参数值）
    logStep('lambda', await client.predict('/lambda', { value: true }));
    logStep('lambda_1', await client.predict('/lambda_1', { value: true }));
    logStep('lambda_2', await client.predict('/lambda_2', { value: [handle_file(tmpFile)] }));

    // 文本处理参数
    logStep('lambda_4', await client.predict('/lambda_4', { value: true })); // 提炼文本
    logStep('lambda_5', await client.predict('/lambda_5', { value: 200 })); // 切分文本长度最终值

    // 音频风格参数（按录制最终值）
    logStep('lambda_14', await client.predict('/lambda_14', { value: 0 }));

    // 增强参数
    logStep(
      'handle_enhance_audio_change',
      await client.predict('/handle_enhance_audio_change', { value: true })
    );
    logStep('lambda_20', await client.predict('/lambda_20', { value: true }));
    logStep('lambda_21', await client.predict('/lambda_21', { value: 'RK4' }));
    logStep('lambda_22', await client.predict('/lambda_22', { value: 128 }));
    logStep('lambda_23', await client.predict('/lambda_23', { value: 0.64 }));

    const finalResult = await client.predict('/generate_audio', {});
    logStep('generate_audio', finalResult);

    return finalResult?.data ?? finalResult;
  } catch (error) {
    logStep('error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
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
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: '缺少文案内容' });
    }

    const sourceLines = extractWenanArrayOnly(text);
    if (!sourceLines.length) {
      return res.status(400).json({
        success: false,
        message: '未从文案结果中提取到 wenan_Array_string',
      });
    }

    const translatedLines = await translateLinesToEnglish(sourceLines);
    const translated = translatedLines.join('\n');
    const txt = buildTxtContent(translatedLines);

    const tts = await callTtsBatch(base, txt);

    return res.json({
      success: true,
      data: {
        sourceLines,
        translated,
        lines: translatedLines,
        txt,
        tts,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音生成失败';
    return res.status(500).json({ success: false, message });
  }
});

export default router;
