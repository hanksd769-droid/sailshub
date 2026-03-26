import { Router, type Request, type Response } from 'express';
import FormData from 'form-data';
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

    // 1) 尝试从常见字段直接取文本
    output = output || pickTextFromUnknown(c.data) || pickTextFromUnknown(c);

    // 2) data.content 可能是 JSON 字符串
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

  // 避免整个链路失败：翻译拿不到时回退原文继续做 TTS
  return output || text;
};

/**
 * 这里按你截图中 API 结构做“批量处理 + 导出SRT”调用示例：
 * 1) 上传 txt 文件
 * 2) 调用 run/predict（参数按你给的 /lambda /lambda_1 语义）
 *
 * 注意：不同版本 ChatTTS 的上传/预测接口路径可能不同，
 * 如果报错，请把 /view=api 中 Javascript snippet 发我，我再精准对齐。
 */
const callTtsBatch = async (base: string, fileBuffer: Buffer, filename: string) => {
  // 1) 上传 TXT（你截图里有“上传TXT,SRT文件”）
  const form = new FormData();
  // 后端 Node 环境使用 form-data，需要 filename
  form.append('files', fileBuffer, { filename });

  const uploadResp = await fetch(`${base}/upload`, {
    method: 'POST',
    headers: {
      ...form.getHeaders(),
    },
    body: form as unknown as BodyInit,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`上传 TXT 失败: ${text || uploadResp.status}`);
  }

  const uploadData = await uploadResp.json();

  // 2) 触发批量处理 + 导出SRT
  // data 含义按你截图：
  // [0] 批量处理(bool)
  // [1] 上传TXT文件(List[filepath] / 上传返回对象)
  // [2] 启用文本切分(bool)
  // [3] 合成成段音频(bool)
  // [4] 导出Srt(bool)
  const predictPayload = {
    data: [true, uploadData, true, true, true],
  };

  const predictResp = await fetch(`${base}/run/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(predictPayload),
  });

  if (!predictResp.ok) {
    const text = await predictResp.text();
    throw new Error(`语音生成失败: ${text || predictResp.status}`);
  }

  return predictResp.json();
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
        tts, // 这里通常会带 mp3/srt 路径或任务信息
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '语音生成失败';
    return res.status(500).json({ success: false, message });
  }
});

/** 通用代理（可继续用于调试任意 api_name） */
router.post('/proxy', authRequired, async (req: Request, res: Response) => {
  try {
    const base = getVoiceBaseUrl();
    if (!base) {
      return res.status(500).json({
        success: false,
        message: 'VOICE_BASE_URL 未配置，请检查 api/.env 或 config.ts',
      });
    }

    const { path, payload } = req.body as { path?: string; payload?: unknown };
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