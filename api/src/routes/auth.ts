import { Router } from 'express';
import { pool } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';
import { hashPassword, signToken, verifyPassword } from '../utils';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body as {
    username: string;
    email?: string;
    password: string;
  };

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '缺少必填字段' });
  }

  const existing = await pool.query('select id from users where username = $1', [
    username,
  ]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ success: false, message: '账号已存在' });
  }

  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    'insert into users (username, email, password_hash) values ($1, $2, $3) returning id, role',
    [username, email ?? null, passwordHash]
  );

  const token = signToken({ userId: result.rows[0].id, role: result.rows[0].role });
  return res.json({ success: true, data: { token } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body as {
    username: string;
    password: string;
  };

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '缺少必填字段' });
  }

  const result = await pool.query(
    'select id, password_hash, role from users where username = $1',
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: '账号或密码错误' });
  }

  const user = result.rows[0];
  const match = await verifyPassword(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, message: '账号或密码错误' });
  }

  const token = signToken({ userId: user.id, role: user.role });
  return res.json({ success: true, data: { token } });
});

router.post('/reset-password', authRequired, async (req: AuthRequest, res) => {
  const { username, newPassword } = req.body as {
    username?: string;
    newPassword: string;
  };

  if (!newPassword) {
    return res.status(400).json({ success: false, message: '缺少新密码' });
  }

  const requesterId = req.user?.userId;
  const requesterRole = req.user?.role;
  if (!requesterId) {
    return res.status(401).json({ success: false, message: '登录失效' });
  }

  let targetUserId = requesterId;
  if (username) {
    const target = await pool.query('select id from users where username = $1', [username]);
    if (target.rows.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    targetUserId = target.rows[0].id;

    if (targetUserId !== requesterId && requesterRole !== 'ADMIN') {
      return res.status(403).json({ success: false, message: '无权限重置他人密码' });
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.query('update users set password_hash = $1 where id = $2', [passwordHash, targetUserId]);

  return res.json({ success: true, message: '密码重置成功' });
});

router.get('/me', authRequired, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: '登录失效' });
  }

  const result = await pool.query('select id, username, email, role from users where id = $1', [userId]);
  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: '登录失效' });
  }

  return res.json({ success: true, data: result.rows[0] });
});

export default router;
