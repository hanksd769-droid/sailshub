import { Button, Form, Input, Typography, message, Modal } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { apiFetch, setToken } from '../lib/api';

interface LoginResponse {
  success: boolean;
  data?: { token: string };
  message?: string;
}

interface ResetPasswordResponse {
  success: boolean;
  message?: string;
}

const LoginPage = () => {
  const navigate = useNavigate();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetForm] = Form.useForm();

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

  const handleResetPassword = async () => {
    const values = await resetForm.validateFields();
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次密码不一致');
      return;
    }

    try {
      const response = await apiFetch<ResetPasswordResponse>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          username: values.username,
          newPassword: values.newPassword,
        }),
      });

      if (response.success) {
        message.success(response.message || '密码重置成功');
        setResetOpen(false);
        resetForm.resetFields();
      } else {
        message.error(response.message || '密码重置失败');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '密码重置失败');
    }
  };

  return (
    <>
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

        <Typography.Paragraph style={{ marginTop: 12, textAlign: 'center' }}>
          <Button type="link" onClick={() => setResetOpen(true)}>
            忘记密码？
          </Button>
        </Typography.Paragraph>

        <Typography.Paragraph style={{ marginTop: 8, textAlign: 'center' }}>
          还没有账号？<Link to="/register">去注册</Link>
        </Typography.Paragraph>
      </Form>

      <Modal
        title="重置密码"
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        onOk={handleResetPassword}
        okText="确认重置"
        cancelText="取消"
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input placeholder="请输入要重置的账号" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, message: '请输入新密码' }]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            rules={[{ required: true, message: '请再次输入新密码' }]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default LoginPage;