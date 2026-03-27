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

const splitSentences = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n|(?<=[。！？!?])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

const buildTxtContent = (lines: string[]) => lines.join('\n');

const pickTextFromUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const obj = value as Record<string, unknown>;
  const candidates = [obj.output, obj.result, obj.text, obj.content, obj.translation];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
};

const getTranslationText = async (text: string) => {
  const moduleInfo = modules.translation;
  if (!moduleInfo) throw new Error('翻译模块未配置，请先在 modules.ts 增加 translation');

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

  return output || text;
};

const callTtsBatch = async (base: string, txtContent: string) => {
  // 用官方 gradio client，避免手动 /predict 出现内部错误
  const client = await Client.connect(base);

  // 写临时 txt
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
    logStep('start', { base, tmpFile, txtPreview: txtContent.slice(0, 200) });

    // 1) 批量处理
    const step1 = await client.predict('/lambda', { value: true });
    logStep('lambda', step1);

    // 2) 导出 SRT
    const step2 = await client.predict('/lambda_1', { value: true });
    logStep('lambda_1', step2);

    // 3) 上传 TXT 到文件组件
    const step3 = await client.predict('/lambda_2', { value: [handle_file(tmpFile)] });
    logStep('lambda_2', step3);

    // 4) 执行生成
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
    // 清理临时文件
    await fs.unlink(tmpFile).catch(() => {});
  }
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
    const txt = buildTxtContent(lines);

    const tts = await callTtsBatch(base, txt);

    return res.json({
      success: true,
      data: {
        translated,
        lines,
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