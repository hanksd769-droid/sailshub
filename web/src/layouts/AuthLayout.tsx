import { Outlet } from 'react-router-dom';
import { Typography, Card } from 'antd';

const AuthLayout = () => {
  return (
    <div className="auth-container">
      <Card className="auth-card" bordered={false}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Coze 内网工作台
        </Typography.Title>
        <Typography.Paragraph className="tag-muted">
          登录后即可使用内部功能模块
        </Typography.Paragraph>
        <Outlet />
      </Card>
    </div>
  );
};

export default AuthLayout;
