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

/** 仅提取 wenan_Array_string */
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

/** 逐句翻译为英文，输出纯文本数组（每项一行） */
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

      // 优先 data.content JSON
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

      // 其次直接字段
      const picked = pickTextFromUnknown(dataObj) || pickTextFromUnknown(c);
      if (picked) sentence = picked;
    }

    sentence = normalizeTranslatedText(sentence || line).replace(/\s+/g, ' ').trim();

    // 兜底：仍是 JSON 壳则回退原句
    if (sentence.startsWith('{') || sentence.startsWith('[')) {
      sentence = line.trim();
    }

    out.push(sentence);
  }

  return out;
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

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
    logStep('start', {
      base,
      tmpFile,
      txtPreview: txtContent.slice(0, 500),
      txtLines: txtContent.split('\n').length,
    });

    // 1) 批量处理 + 导出SRT
    const step1 = await client.predict('/lambda', { value: true });
    logStep('lambda', step1);

    const step2 = await client.predict('/lambda_1', { value: true });
    logStep('lambda_1', step2);

    // 2) 文件方式绑定
    let fileBindOk = true;
    try {
      const step3 = await client.predict('/lambda_2', {
        value: [handle_file(tmpFile)], // ListFiles
      });
      logStep('lambda_2', step3);
    } catch (e) {
      fileBindOk = false;
      logStep('lambda_2_error', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    // 3) 兜底：直接写入“输入文字”
    const stepText = await client.predict('/lambda_3', { value: txtContent });
    logStep('lambda_3', { fileBindOk, result: stepText });

    // 4) 参数（按录制最终值）
    logStep('lambda_4', await client.predict('/lambda_4', { value: true })); // 提炼文本
    logStep('lambda_5', await client.predict('/lambda_5', { value: 200 })); // 切分长度
    logStep('lambda_14', await client.predict('/lambda_14', { value: 0 }));

    logStep(
      'handle_enhance_audio_change',
      await client.predict('/handle_enhance_audio_change', { value: true })
    );
    logStep('lambda_20', await client.predict('/lambda_20', { value: true }));
    logStep('lambda_21', await client.predict('/lambda_21', { value: 'RK4' }));
    logStep('lambda_22', await client.predict('/lambda_22', { value: 128 }));
    logStep('lambda_23', await client.predict('/lambda_23', { value: 0.64 }));

    // 5) 生成
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

    // 只取 wenan_Array_string
    const sourceLines = extractWenanArrayOnly(text);
    if (!sourceLines.length) {
      return res.status(400).json({
        success: false,
        message: '未从文案结果中提取到 wenan_Array_string',
      });
    }

    // 逐句英译 => 一行一句
    const translatedLines = await translateLinesToEnglish(sourceLines);
    const txt = buildTxtContent(translatedLines);

    // TTS 批量+SRT
    const tts = await callTtsBatch(base, txt);

    return res.json({
      success: true,
      data: {
        sourceLines, // 原中文数组
        lines: translatedLines, // 英文数组
        translated: txt, // 英文多行文本
        txt, // 实际上传到 TTS 的 txt 内容
        tts, // TTS 返回
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音生成失败';
    return res.status(500).json({ success: false, message });
  }
});

export default router;