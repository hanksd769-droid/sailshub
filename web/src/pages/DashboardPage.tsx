import { Card, Input, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const DashboardPage = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            功能总览
          </Typography.Title>
          <Typography.Text type="secondary">
            选择功能模块开始工作
          </Typography.Text>
        </div>
        <Input.Search placeholder="搜索功能" style={{ width: 260 }} />
      </div>

      <div className="dashboard-grid">
        <Card className="module-card" onClick={() => navigate('/runs')}>
          <Space direction="vertical" size={8}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              我的任务
            </Typography.Title>
            <Typography.Text type="secondary">
              查看当前账号的运行记录与错误详情
            </Typography.Text>
            <Space size={8}>
              <Tag>任务</Tag>
              <Tag>状态</Tag>
              <Tag>历史</Tag>
            </Space>
          </Space>
        </Card>

        <Card className="module-card" onClick={() => navigate('/modules/detail-image')}>
          <Space direction="vertical" size={8}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              详情图生成
            </Typography.Title>
            <Typography.Text type="secondary">
              支持参考图/非参考图分支
            </Typography.Text>
            <Space size={8}>
              <Tag>图片</Tag>
              <Tag>多图</Tag>
              <Tag>文案</Tag>
            </Space>
          </Space>
        </Card>

        <Card className="module-card" onClick={() => navigate('/modules/video-copy')}>
          <Space direction="vertical" size={8}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              视频提取文案
            </Typography.Title>
            <Typography.Text type="secondary">
              支持视频 URL / 本地上传双模式
            </Typography.Text>
            <Space size={8}>
              <Tag>视频</Tag>
              <Tag>识别</Tag>
              <Tag>文案</Tag>
            </Space>
          </Space>
        </Card>

        <Card className="module-card" onClick={() => navigate('/modules/product-copy')}>
          <Space direction="vertical" size={8}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              产品文案生成
            </Typography.Title>
            <Typography.Text type="secondary">
              输入产品信息与模板，生成营销文案
            </Typography.Text>
            <Space size={8}>
              <Tag>产品</Tag>
              <Tag>模板</Tag>
              <Tag>文案</Tag>
            </Space>
          </Space>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;