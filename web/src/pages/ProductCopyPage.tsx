import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream } from '../lib/api';

const templateOptions = [
  { label: '知识科普', value: '知识科普' },
  { label: '种草推荐', value: '种草推荐' },
  { label: '直播带货', value: '直播带货' },
];

const ProductCopyPage = () => {
  const [streamText, setStreamText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    const values = await form.validateFields();

    setStreamText('');
    setJsonText('');
    setErrorText('');
    setProgress(5);
    setLoading(true);

    try {
      await runWorkflowStream(
        'product-copy',
        {
          Product_Name: values.Product_Name,
          maidian: values.maidian,
          muban: values.muban,
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 8, 95));
          setJsonText((prev) => `${prev}${prev ? '\n' : ''}${JSON.stringify(data, null, 2)}`);

          if (typeof data === 'string') {
            setStreamText((prev) => `${prev}${prev ? '\n' : ''}${data}`);
            return;
          }

          const eventObj = data as {
            event?: string;
            data?: { content?: string };
          };

          if (eventObj.event === 'Message' && eventObj.data?.content) {
            try {
              const parsed = JSON.parse(eventObj.data.content) as { output?: string };
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${parsed.output ?? eventObj.data.content}`);
            } catch {
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${eventObj.data.content}`);
            }
          }
        },
        () => {
          setProgress(100);
          setLoading(false);
          message.success('文案生成完成');
        },
        (err) => {
          setLoading(false);
          setErrorText(err || '文案生成失败');
          message.error(err || '文案生成失败');
        }
      );
    } catch (error) {
      setLoading(false);
      const msg = error instanceof Error ? error.message : '文案生成失败';
      setErrorText(msg);
      message.error(msg);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            产品文案生成
          </Typography.Title>
          <Typography.Text type="secondary">
            输入产品名称、卖点和模板，自动生成产品文案
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical" form={form} initialValues={{ muban: '知识科普' }}>
            <Form.Item
              label="产品名称"
              name="Product_Name"
              rules={[{ required: true, message: '请输入产品名称' }]}
            >
              <Input placeholder="例如：377美白双管身体乳" />
            </Form.Item>

            <Form.Item
              label="卖点文案"
              name="maidian"
              rules={[{ required: true, message: '请输入卖点文案' }]}
            >
              <Input.TextArea rows={8} placeholder="请输入产品卖点、功能、成分等信息" />
            </Form.Item>

            <Form.Item
              label="模板"
              name="muban"
              rules={[{ required: true, message: '请选择模板' }]}
            >
              <Select options={templateOptions} placeholder="请选择模板" />
            </Form.Item>

            <Button type="primary" loading={loading} onClick={handleSubmit}>
              开始生成
            </Button>
          </Form>
        </Card>

        <ResultPanel
          title="生成结果"
          streamText={streamText}
          jsonText={jsonText}
          loading={loading}
          progress={progress}
          errorText={errorText}
          onCopyText={() => navigator.clipboard.writeText(streamText)}
          onCopyJson={() => navigator.clipboard.writeText(jsonText)}
        />
      </Space>
    </div>
  );
};

export default ProductCopyPage;