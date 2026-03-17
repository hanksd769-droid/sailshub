import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config';

export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async (password: string, hash: string) => {
  return bcrypt.compare(password, hash);
};

export const signToken = (payload: Record<string, unknown>) => {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
};
