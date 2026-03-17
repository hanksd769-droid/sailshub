import { Router } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { config } from '../config';

const router = Router();
const upload = multer();

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '缺少文件' });
  }

  const form = new FormData();
  form.append('file', req.file.buffer, req.file.originalname);

  const response = await fetch('https://api.coze.cn/v1/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.cozeToken}`,
      ...form.getHeaders(),
    },
    body: form as unknown as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text();
    return res.status(500).json({ success: false, message: text });
  }

  const data = await response.json();
  return res.json({ success: true, data });
});

export default router;
