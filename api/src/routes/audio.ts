import { Router } from 'express';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { authRequired } from '../middleware/auth';
import { config } from '../config';

const router = Router();

/**
 * 通过 URL 下载音频文件并上传到 Coze 获取 file_id
 * POST /api/audio/upload-from-url
 * Body: { url: string }
 */
router.post('/upload-from-url', authRequired, async (req, res) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, message: '缺少音频 URL' });
  }

  try {
    // 1. 下载音频文件
    console.log('Downloading audio from:', url);
    const audioResponse = await fetch(url);
    if (!audioResponse.ok) {
      return res.status(500).json({
        success: false,
        message: `下载音频失败: ${audioResponse.status}`,
      });
    }

    const audioBuffer = await audioResponse.buffer();
    const contentType = audioResponse.headers.get('content-type') || 'audio/wav';

    // 2. 上传到 Coze
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.wav',
      contentType,
    });

    console.log('Uploading to Coze...');
    const cozeResponse = await fetch('https://api.coze.cn/v1/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cozeToken}`,
        ...form.getHeaders(),
      },
      body: form as unknown as BodyInit,
    });

    if (!cozeResponse.ok) {
      const text = await cozeResponse.text();
      console.error('Coze upload failed:', cozeResponse.status, text);
      return res.status(500).json({
        success: false,
        message: `上传到 Coze 失败: ${cozeResponse.status}`,
        detail: text,
      });
    }

    const cozeData = await cozeResponse.json();
    console.log('Coze upload success:', cozeData);

    // 返回 file_id
    return res.json({
      success: true,
      data: {
        file_id: cozeData.data?.id,
        file_url: cozeData.data?.url,
        coze_response: cozeData,
      },
    });
  } catch (error) {
    console.error('Upload audio from URL failed:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '上传失败',
    });
  }
});

/**
 * 批量上传音频文件到 Coze
 * POST /api/audio/batch-upload-from-urls
 * Body: { urls: string[] }
 */
router.post('/batch-upload-from-urls', authRequired, async (req, res) => {
  const { urls } = req.body as { urls?: string[] };

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, message: '缺少音频 URL 数组' });
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      console.log(`[${i + 1}/${urls.length}] Downloading:`, url);
      const audioResponse = await fetch(url);
      if (!audioResponse.ok) {
        errors.push({ index: i, url, error: `下载失败: ${audioResponse.status}` });
        continue;
      }

      const audioBuffer = await audioResponse.buffer();
      const contentType = audioResponse.headers.get('content-type') || 'audio/wav';

      const form = new FormData();
      form.append('file', audioBuffer, {
        filename: `audio_${i}.wav`,
        contentType,
      });

      const cozeResponse = await fetch('https://api.coze.cn/v1/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.cozeToken}`,
          ...form.getHeaders(),
        },
        body: form as unknown as BodyInit,
      });

      if (!cozeResponse.ok) {
        const text = await cozeResponse.text();
        errors.push({ index: i, url, error: `上传失败: ${cozeResponse.status}` });
        continue;
      }

      const cozeData = await cozeResponse.json();
      results.push({
        index: i,
        url,
        file_id: cozeData.data?.id,
        file_url: cozeData.data?.url,
      });
    } catch (error) {
      errors.push({
        index: i,
        url,
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  }

  return res.json({
    success: true,
    data: {
      results,
      errors,
      total: urls.length,
      success_count: results.length,
      error_count: errors.length,
    },
  });
});

export default router;
