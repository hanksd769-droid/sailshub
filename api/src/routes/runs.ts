import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { modules } from '../modules';
import { authRequired, AuthRequest } from '../middleware/auth';
import { pool } from '../db';
import { cozeClient } from '../coze';

const router = Router();

router.get('/', authRequired, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: '登录失效' });
  }

  const result = await pool.query(
    `select id, module_key, workflow_id, input, output, status, created_at, finished_at
     from runs
     where user_id = $1
     order by created_at desc
     limit 100`,
    [userId]
  );

  return res.json({ success: true, data: result.rows });
});

router.get('/:id', authRequired, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: '登录失效' });
  }

  const result = await pool.query(
    `select id, module_key, workflow_id, input, output, status, created_at, finished_at
     from runs
     where id = $1 and user_id = $2
     limit 1`,
    [req.params.id, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  return res.json({ success: true, data: result.rows[0] });
});

router.post('/:key/run', authRequired, async (req: AuthRequest, res) => {
  const moduleKey = req.params.key as keyof typeof modules;
  const moduleInfo = modules[moduleKey];
  if (!moduleInfo) {
    return res.status(404).json({ success: false, message: '模块不存在' });
  }

  const { parameters } = req.body as { parameters: Record<string, unknown> };
  if (!parameters) {
    return res.status(400).json({ success: false, message: '缺少参数' });
  }

  console.log('[run] module:', moduleKey, 'workflow:', moduleInfo.workflowId);
  console.log('[run] parameters:', JSON.stringify(parameters));

  const runId = uuidv4();
  await pool.query(
    'insert into runs (id, user_id, module_key, workflow_id, input, status) values ($1, $2, $3, $4, $5, $6)',
    [runId, req.user?.userId ?? null, moduleKey, moduleInfo.workflowId, parameters, 'RUNNING']
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const chunks: unknown[] = [];

  try {
    const stream = await cozeClient.workflows.runs.stream({
      workflow_id: moduleInfo.workflowId,
      parameters,
    });

    for await (const chunk of stream) {
      chunks.push(chunk);
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    await pool.query('update runs set status = $1, output = $2, finished_at = now() where id = $3', [
      'SUCCESS',
      chunks,
      runId,
    ]);
    res.write('event: done\n');
    res.write(`data: ${JSON.stringify({ runId })}\n\n`);
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : '运行失败';
    await pool.query('update runs set status = $1, output = $2, finished_at = now() where id = $3', [
      'FAILED',
      { error: message },
      runId,
    ]);
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ message })}\n\n`);
    res.end();
  }
});

export default router;
