import { Button, Form, Input, Typography } from 'antd';
import { Link } from 'react-router-dom';

const RegisterPage = () => {
  return (
    <Form layout="vertical">
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
      <Button type="primary" block>
        注册
      </Button>
      <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
        已有账号？<Link to="/login">去登录</Link>
      </Typography.Paragraph>
    </Form>
  );
};

export default RegisterPage;
