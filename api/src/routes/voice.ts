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

/** 只提取 wenan_Array_string 数组 */
const extractWenanArrayOnly = (raw: string): string[] => {
  // 先尝试直接 JSON
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const arr = obj.wenan_Array_string;
    if (Array.isArray(arr)) {
      return arr.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  // 再尝试从字符串里正则截取
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

/** 逐句翻译成英文 */
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

      // 常见字段直接提取
      translated = translated || pickTextFromUnknown(c.data) || pickTextFromUnknown(c);

      // content 可能是 JSON 字符串
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

    translatedLines.push((translated || line).trim());
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

    // 1) 批量处理
    const step1 = await client.predict('/lambda', { value: true });
    logStep('lambda', step1);

    // 2) 导出SRT
    const step2 = await client.predict('/lambda_1', { value: true });
    logStep('lambda_1', step2);

    // 3) 上传TXT（注意：这里必须是数组）
    const step3 = await client.predict('/lambda_2', { value: [handle_file(tmpFile)] });
    logStep('lambda_2', step3);

    // 4) 生成音频
    const step4 = await client.predict('/generate_audio', {});
    logStep('generate_audio', step4);

    return step4?.data ?? step4;
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

/** 文案 -> 仅提取 wenan_Array_string -> 英译逐句 -> txt -> TTS批量+SRT */
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