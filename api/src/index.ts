import express from 'express';
import cors from 'cors';
import { ensureSchema } from './db';
import authRoutes from './routes/auth';
import modulesRoutes from './routes/modules';
import filesRoutes from './routes/files';
import runsRoutes from './routes/runs';
import { config } from './config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ success: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/runs', runsRoutes);

ensureSchema().then(() => {
  app.listen(config.port, () => {
    console.log(`API running on port ${config.port}`);
  });
});
