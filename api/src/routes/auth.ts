import { Router } from 'express';
import { pool } from '../db';
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

router.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body as {
    username: string;
    newPassword: string;
  };

  if (!username || !newPassword) {
    return res.status(400).json({ success: false, message: '缺少必填字段' });
  }

  const existing = await pool.query('select id from users where username = $1', [username]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.query('update users set password_hash = $1 where username = $2', [
    passwordHash,
    username,
  ]);

  return res.json({ success: true, message: '密码重置成功' });
});

export default router;
