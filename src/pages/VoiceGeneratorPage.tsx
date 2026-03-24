import { Button, Card, Space, Typography } from 'antd';
import { useMemo } from 'react';

const VoiceGeneratorPage = () => {
  const voiceStudioUrl = useMemo(() => 'http://127.0.0.1:7860/?__theme=dark', []);
  const apiDocUrl = useMemo(() => 'http://127.0.0.1:7860/?__theme=dark&view=api', []);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            语音生成
          </Typography.Title>
          <Typography.Text type="secondary">
            已接入本地语音生成器，可直接在本系统内打开与调试
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>
              服务地址：
              <a href={voiceStudioUrl} target="_blank" rel="noreferrer">
                {voiceStudioUrl}
              </a>
            </Typography.Text>
            <Typography.Text>
              API 文档：
              <a href={apiDocUrl} target="_blank" rel="noreferrer">
                {apiDocUrl}
              </a>
            </Typography.Text>
            <Space>
              <Button type="primary" href={voiceStudioUrl} target="_blank" rel="noreferrer">
                新标签打开语音生成器
              </Button>
              <Button href={apiDocUrl} target="_blank" rel="noreferrer">
                打开 API 页面
              </Button>
            </Space>
          </Space>
        </Card>

        <Card bodyStyle={{ padding: 0, overflow: 'hidden' }}>
          <iframe
            title="voice-generator"
            src={voiceStudioUrl}
            style={{ width: '100%', height: '78vh', border: 'none' }}
          />
        </Card>
      </Space>
    </div>
  );
};

export default VoiceGeneratorPage;
