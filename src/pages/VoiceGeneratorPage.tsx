import { Button, Card, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { getVoiceConfig } from '../lib/api';

const VoiceGeneratorPage = () => {
  const [studioUrl, setStudioUrl] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await getVoiceConfig();
        setStudioUrl(res.data.studioUrl);
        setApiUrl(res.data.apiUrl);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '读取语音服务配置失败';
        message.error(msg);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            语音生成
          </Typography.Title>
          <Typography.Text type="secondary">
            已接入局域网语音服务器，所有客户端统一使用服务器算力
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section" loading={loading}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text>
              服务地址：
              {studioUrl ? (
                <a href={studioUrl} target="_blank" rel="noreferrer">
                  {studioUrl}
                </a>
              ) : (
                ' - '
              )}
            </Typography.Text>

            <Typography.Text>
              API 页面：
              {apiUrl ? (
                <a href={apiUrl} target="_blank" rel="noreferrer">
                  {apiUrl}
                </a>
              ) : (
                ' - '
              )}
            </Typography.Text>

            <Space>
              <Button type="primary" disabled={!studioUrl} href={studioUrl} target="_blank" rel="noreferrer">
                新标签打开语音生成器
              </Button>
              <Button disabled={!apiUrl} href={apiUrl} target="_blank" rel="noreferrer">
                打开 API 页面
              </Button>
            </Space>
          </Space>
        </Card>

        <Card bodyStyle={{ padding: 0, overflow: 'hidden' }} loading={loading}>
          {studioUrl ? (
            <iframe
              title="voice-generator"
              src={studioUrl}
              style={{ width: '100%', height: '78vh', border: 'none' }}
            />
          ) : (
            <div style={{ padding: 24 }}>
              <Typography.Text type="secondary">未获取到语音服务地址</Typography.Text>
            </div>
          )}
        </Card>
      </Space>
    </div>
  );
};

export default VoiceGeneratorPage;