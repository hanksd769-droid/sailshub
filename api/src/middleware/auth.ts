import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils';

export interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

export const authRequired = (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  const token = header.replace('Bearer ', '');
  try {
    const payload = verifyToken(token) as { userId: number; role: string };
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: '登录失效' });
  }
};
