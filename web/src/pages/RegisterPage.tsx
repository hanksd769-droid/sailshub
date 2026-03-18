import { Button, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, setToken } from '../lib/api';

interface RegisterResponse {
  success: boolean;
  data?: { token: string };
  message?: string;
}

const RegisterPage = () => {
  const navigate = useNavigate();

  const handleFinish = async (values: {
    username: string;
    email?: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次密码不一致');
      return;
    }

    try {
      const response = await apiFetch<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: values.username,
          email: values.email,
          password: values.password,
        }),
      });
      if (response.success && response.data?.token) {
        setToken(response.data.token);
        message.success('注册成功');
        navigate('/dashboard');
      } else {
        message.error(response.message || '注册失败');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '注册失败');
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
        label="邮箱"
        name="email"
        rules={[{ required: true, message: '请输入邮箱' }]}
      >
        <Input placeholder="name@company.com" />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password placeholder="至少 6 位" />
      </Form.Item>
      <Form.Item
        label="确认密码"
        name="confirmPassword"
        dependencies={['password']}
        rules={[{ required: true, message: '请再次输入密码' }]}
      >
        <Input.Password placeholder="再次输入密码" />
      </Form.Item>
      <Button type="primary" block htmlType="submit">
        注册
      </Button>
      <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
        已有账号？<Link to="/login">去登录</Link>
      </Typography.Paragraph>
    </Form>
  );
};

export default RegisterPage;