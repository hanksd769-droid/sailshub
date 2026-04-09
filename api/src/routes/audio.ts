import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { authRequired } from '../middleware/auth';

const router = Router();

/**
 * 从本地文件路径上传音频到 Coze 获取 file_id
 * POST /api/audio/upload-local
 * Body: { filePath: string }
 */
router.post('/upload-local', authRequired, async (req, res) => {
  const { filePath } = req.body as { filePath?: string };

  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ success: false, message: '缺少文件路径' });
  }

  try {
    // 从 URL 中提取本地路径
    // URL 格式: http://192.168.2.29:7860/file=C:\Users\...\audio.wav
    let localPath = filePath;
    if (filePath.includes('/file=')) {
      localPath = filePath.split('/file=')[1];
    }

    // 解码 URL 编码的路径
    localPath = decodeURIComponent(localPath);

    console.log('Reading local file:', localPath);

    // 检查文件是否存在
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({
        success: false,
        message: `文件不存在: ${localPath}`,
      });
    }

    // 读取文件
    const fileBuffer = fs.readFileSync(localPath);
    const filename = path.basename(localPath);

    console.log('File size:', fileBuffer.length, 'bytes');

    // 上传到 Coze
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename,
      contentType: 'audio/wav',
    });

    console.log('Uploading to Coze...');
    const cozeResponse = await fetch('https://api.coze.cn/v1/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer cztei_qsawsE2464f4KCLNMY8aBTLvelSmFlU0iu9dcmwpHnI4R75T3U2UYaqgi4UJ0gSo4`,
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
    console.error('Upload audio failed:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '上传失败',
    });
  }
});

/**
 * 批量从本地文件路径上传音频到 Coze
 * POST /api/audio/batch-upload-local
 * Body: { filePaths: string[] }
 */
router.post('/batch-upload-local', authRequired, async (req, res) => {
  const { filePaths } = req.body as { filePaths?: string[] };

  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return res.status(400).json({ success: false, message: '缺少文件路径数组' });
  }

  const results: Array<{ index: number; filePath: string; file_id?: string; file_url?: string }> = [];
  const errors: Array<{ index: number; filePath: string; error: string }> = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    try {
      // 从 URL 中提取本地路径
      let localPath = filePath;
      if (filePath.includes('/file=')) {
        localPath = filePath.split('/file=')[1];
      }
      localPath = decodeURIComponent(localPath);

      console.log(`[${i + 1}/${filePaths.length}] Reading:`, localPath);

      if (!fs.existsSync(localPath)) {
        errors.push({ index: i, filePath, error: '文件不存在' });
        continue;
      }

      const fileBuffer = fs.readFileSync(localPath);
      const filename = path.basename(localPath);

      const form = new FormData();
      form.append('file', fileBuffer, {
        filename,
        contentType: 'audio/wav',
      });

      const cozeResponse = await fetch('https://api.coze.cn/v1/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer cztei_qsawsE2464f4KCLNMY8aBTLvelSmFlU0iu9dcmwpHnI4R75T3U2UYaqgi4UJ0gSo4`,
          ...form.getHeaders(),
        },
        body: form as unknown as BodyInit,
      });

      if (!cozeResponse.ok) {
        const text = await cozeResponse.text();
        errors.push({ index: i, filePath, error: `上传失败: ${cozeResponse.status}` });
        continue;
      }

      const cozeData = await cozeResponse.json();
      results.push({
        index: i,
        filePath,
        file_id: cozeData.data?.id,
        file_url: cozeData.data?.url,
      });
    } catch (error) {
      errors.push({
        index: i,
        filePath,
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  }

  return res.json({
    success: true,
    data: {
      results,
      errors,
      total: filePaths.length,
      success_count: results.length,
      error_count: errors.length,
    },
  });
});

export default router;
