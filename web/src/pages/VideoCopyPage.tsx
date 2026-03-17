import { Button, Card, Form, Space, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';

const VideoCopyPage = () => {
  const [streamText, setStreamText] = useState('');

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            视频提取文案
          </Typography.Title>
          <Typography.Text type="secondary">
            上传视频后自动提取文案
          </Typography.Text>
        </div>
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical">
            <Form.Item label="上传视频" name="input">
              <Upload multiple>
                <Button icon={<UploadOutlined />}>选择视频文件</Button>
              </Upload>
            </Form.Item>
            <Button type="primary">开始提取</Button>
          </Form>
        </Card>
        <ResultPanel
          title="提取结果"
          streamText={streamText}
          jsonText={streamText}
          onCopyText={() => navigator.clipboard.writeText(streamText)}
          onCopyJson={() => navigator.clipboard.writeText(streamText)}
        />
      </Space>
    </div>
  );
};

export default VideoCopyPage;
