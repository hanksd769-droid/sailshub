import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = ['COZE_API_TOKEN', 'DATABASE_URL', 'JWT_SECRET'];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
});

export const config = {
  cozeToken: process.env.COZE_API_TOKEN as string,
  databaseUrl: process.env.DATABASE_URL as string,
  jwtSecret: process.env.JWT_SECRET as string,
  port: Number(process.env.PORT ?? 3000),
};
