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
  // 1) 整体 JSON
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const arr = obj.wenan_Array_string;
    if (Array.isArray(arr)) {
      return arr.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }

  // 2) 从字符串内截取
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

/** 逐句翻译为英文，返回纯文本数组（每项一行） */
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

      // 优先从 data.content JSON 里取 output/result/text
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

      // 其次直接字段提取
      const picked = pickTextFromUnknown(dataObj) || pickTextFromUnknown(c);
      if (picked) sentence = picked;
    }

    sentence = normalizeTranslatedText(sentence || line);
    sentence = sentence.replace(/\s+/g, ' ').trim();

    // 兜底：如果还是 JSON 壳，回退原句
    if (sentence.startsWith('{') || sentence.startsWith('[')) {
      sentence = line.trim();
    }

    out.push(sentence);
  }

  return out;
};

const buildTxtContent = (lines: string[]) => lines.join('\n');

/** 按你 API Recorder 录制流程调用 TTS */
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
    logStep('lambda', await client.predict('/lambda', { value: true }));

    // 2) 导出SRT
    logStep('lambda_1', await client.predict('/lambda_1', { value: true }));

    // 3) 上传TXT文件（必须是数组）
    logStep('lambda_2', await client.predict('/lambda_2', { value: [handle_file(tmpFile)] }));

    // 4) 可选参数（按你录制最终值）
    logStep('lambda_4', await client.predict('/lambda_4', { value: true })); // 提炼文本
    logStep('lambda_5', await client.predict('/lambda_5', { value: 200 })); // 切分长度
    logStep('lambda_14', await client.predict('/lambda_14', { value: 0 })); // oral

    logStep(
      'handle_enhance_audio_change',
      await client.predict('/handle_enhance_audio_change', { value: true })
    );
    logStep('lambda_20', await client.predict('/lambda_20', { value: true })); // denoise
    logStep('lambda_21', await client.predict('/lambda_21', { value: 'RK4' })); // ODE
    logStep('lambda_22', await client.predict('/lambda_22', { value: 128 })); // CFM Number
    logStep('lambda_23', await client.predict('/lambda_23', { value: 0.64 })); // CFM Temp

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

/**
 * 输入：产品文案结果（包含 wenan_Array_string）
 * 输出：英文逐句 + txt + 调用TTS后的结果
 */
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

    // 你要的格式：每句一行
    const txt = buildTxtContent(translatedLines);

    const tts = await callTtsBatch(base, txt);

    return res.json({
      success: true,
      data: {
        sourceLines,               // 原始中文数组
        lines: translatedLines,    // 英文数组（每句）
        translated: txt,           // 英文多行文本
        txt,                       // 送入 TTS 的 txt 内容
        tts,                       // TTS 返回（含音频/SRT信息）
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音生成失败';
    return res.status(500).json({ success: false, message });
  }
});

export default router;