import { Router } from 'express';
import { modules } from '../modules';

const router = Router();

router.get('/', (req, res) => {
  return res.json({ success: true, data: Object.values(modules) });
});

router.get('/:key', (req, res) => {
  const moduleKey = req.params.key as keyof typeof modules;
  const moduleInfo = modules[moduleKey];
  if (!moduleInfo) {
    return res.status(404).json({ success: false, message: '模块不存在' });
  }
  return res.json({ success: true, data: moduleInfo });
});

export default router;
