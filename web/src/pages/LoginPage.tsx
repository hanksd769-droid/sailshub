import { Button, Form, Input, Typography } from 'antd';
import { Link } from 'react-router-dom';

const LoginPage = () => {
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
        label="密码"
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password placeholder="请输入密码" />
      </Form.Item>
      <Button type="primary" block>
        登录
      </Button>
      <Typography.Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
        还没有账号？<Link to="/register">去注册</Link>
      </Typography.Paragraph>
    </Form>
  );
};

export default LoginPage;
