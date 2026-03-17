import { CozeAPI } from '@coze/api';
import { config } from './config';

export const cozeClient = new CozeAPI({
  token: config.cozeToken,
  baseURL: 'https://api.coze.cn',
});
