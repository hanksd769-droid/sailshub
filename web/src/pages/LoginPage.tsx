import { Button, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, setToken } from '../lib/api';

interface LoginResponse {
  success: boolean;
  data?: { token: string };
  message?: string;
}

const LoginPage = () => {
  const navigate = useNavigate();

  const handleFinish = async (values: { username: string; password: string }) => {
    try {
      const response = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      if (response.success && response.data?.token) {
        setToken(response.data.token);
        message.success('登录成功');
        navigate('/dashboard');
      } else {
        message.error(response.message || '登录失败');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败');
    }
  };

  return (
    <Form layout="vertical" onFinish={handleFinish}>
      <Form.Item
        label="账号"
        name="username"
        rules={[{ required: true, message: '请输入账号' }]}
      >
        <Input placeholder="请输入账号" />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password placeholder="请输入密码" />
      </Form.Item>
      <Button type="primary" block htmlType="submit">
        登录
      </Button>
      <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
        还没有账号？<Link to="/register">去注册</Link>
      </Typography.Paragraph>
    </Form>
  );
};

export default LoginPage;
