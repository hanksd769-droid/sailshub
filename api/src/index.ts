import express from 'express';
import cors from 'cors';
import { ensureSchema } from './db';
import authRoutes from './routes/auth';
import modulesRoutes from './routes/modules';
import filesRoutes from './routes/files';
import runsRoutes from './routes/runs';
import voiceRoutes from './routes/voice';
import { config } from './config';

const app = express();

// 配置 CORS 允许局域网访问
app.use(cors({
  origin: '*', // 内网环境允许所有来源
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 预检请求缓存 24 小时
}));

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/runs', runsRoutes);
app.use('/api/voice', voiceRoutes);

ensureSchema().then(() => {
  app.listen(config.port, () => {
    console.log(`API running on port ${config.port}`);
  });
});