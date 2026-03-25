import { Router, type Request, type Response } from 'express';
import { authRequired } from '../middleware/auth';
import { config } from '../config';

const router = Router();

/** 前端读取语音服务配置（用于显示按钮/iframe） */
router.get('/config', authRequired, (_req: Request, res: Response) => {
  const base = config.voiceBaseUrl.replace(/\/+$/, '');
  return res.json({
    success: true,
    data: {
      studioUrl: `${base}/?__theme=dark`,
      apiUrl: `${base}/?__theme=dark&view=api`,
      baseUrl: base,
    },
  });
});

/**
 * 服务器端代理调用 TTS API（示例）
 * 你后续只需要把 body 里的 payload 转发到 gradio 对应接口
 */
router.post('/proxy', authRequired, async (req: Request, res: Response) => {
  try {
    const base = config.voiceBaseUrl.replace(/\/+$/, '');
    const { path, payload } = req.body as {
      path: string; // 例如 "/run/predict" 或你 gradio recorder 生成的真实 endpoint
      payload: unknown;
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
      return res.status(500).json({ success: false, message: text });
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