import { Layout, Menu, Typography, Avatar, Space } from 'antd';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  AppstoreOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  UserOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const MainLayout = () => {
  const location = useLocation();
  const menuItems = [
    {
      key: '/dashboard',
      icon: <AppstoreOutlined />,
      label: <NavLink to="/dashboard">功能首页</NavLink>,
    },
    {
      key: '/modules/detail-image',
      icon: <PictureOutlined />,
      label: <NavLink to="/modules/detail-image">详情图生成</NavLink>,
    },
    {
      key: '/modules/video-copy',
      icon: <VideoCameraOutlined />,
      label: <NavLink to="/modules/video-copy">视频提取文案</NavLink>,
    },
  ];

  return (
    <Layout className="app-shell">
      <Sider width={240} theme="light">
        <div style={{ padding: '20px 16px' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Coze 工作台
          </Typography.Title>
          <Typography.Text type="secondary">内网功能集成</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px' }}>
          <Space style={{ float: 'right' }}>
            <Avatar icon={<UserOutlined />} />
            <Typography.Text>管理员</Typography.Text>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
