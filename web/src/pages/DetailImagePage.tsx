import { Button, Card, Form, Input, Select, Space, Tabs, Typography, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import ResultPanel from '../components/ResultPanel';

const DetailImagePage = () => {
  const [branch, setBranch] = useState<'withRef' | 'noRef'>('withRef');
  const [streamText, setStreamText] = useState('');

  const workflowOptions = useMemo(
    () => [
      {
        key: 'withRef',
        label: '有参考图版本',
        workflowId: '7616669788698361897',
      },
      {
        key: 'noRef',
        label: '无参考图版本',
        workflowId: '7615500483961585691',
      },
    ],
    []
  );

  const activeWorkflow = workflowOptions.find((item) => item.key === branch);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            详情图生成
          </Typography.Title>
          <Typography.Text type="secondary">
            输入产品信息与图片，生成详情图或文案组合
          </Typography.Text>
        </div>
      </div>
      <Tabs
        activeKey={branch}
        onChange={(key) => setBranch(key as 'withRef' | 'noRef')}
        items={workflowOptions.map((option) => ({
          key: option.key,
          label: option.label,
        }))}
      />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical">
            <Form.Item label="Workflow ID">
              <Input value={activeWorkflow?.workflowId} disabled />
            </Form.Item>
            <Form.Item label="画幅比例" name="aspectRatio">
              <Select
                options={['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'].map((value) => ({
                  value,
                  label: value,
                }))}
                placeholder="请选择画幅比例"
              />
            </Form.Item>
            <Form.Item label="主图" name="img1">
              <Upload>
                <Button icon={<UploadOutlined />}>上传主图</Button>
              </Upload>
              <Input style={{ marginTop: 8 }} placeholder="或输入图片 URL" />
            </Form.Item>
            {branch === 'withRef' && (
              <Form.Item label="参考图" name="img2">
                <Upload multiple>
                  <Button icon={<UploadOutlined />}>上传参考图</Button>
                </Upload>
                <Input.TextArea
                  style={{ marginTop: 8 }}
                  placeholder="或输入图片 URL 列表，每行一个"
                  rows={4}
                />
              </Form.Item>
            )}
            <Form.Item label="卖点文案" name="maidian">
              <Input.TextArea rows={6} placeholder="请输入卖点文案" />
            </Form.Item>
            <Form.Item label="产品名称" name="name">
              <Input placeholder="请输入产品名称" />
            </Form.Item>
            <Button type="primary">开始生成</Button>
          </Form>
        </Card>
        <ResultPanel
          title="生成结果"
          streamText={streamText}
          jsonText={streamText}
          onCopyText={() => navigator.clipboard.writeText(streamText)}
          onCopyJson={() => navigator.clipboard.writeText(streamText)}
        />
      </Space>
    </div>
  );
};

export default DetailImagePage;
