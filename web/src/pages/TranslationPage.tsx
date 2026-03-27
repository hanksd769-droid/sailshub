import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream } from '../lib/api';

const languageOptions = [
  { value: 'english', label: '英文 (english)' },
  { value: 'hindi', label: '印地语 (hindi)' },
  { value: 'indonesian', label: '印尼语 (indonesian)' },
  { value: 'vietnamese', label: '越南语 (vietnamese)' },
  { value: 'japanese', label: '日语 (japanese)' },
  { value: 'thai', label: '泰语 (thai)' },
  { value: 'burmese', label: '缅甸语 (burmese)' },
  { value: 'malay', label: '马来语 (malay)' },
  { value: 'korean', label: '韩语 (korean)' },
];

const TranslationPage = () => {
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
        'translation',
        {
          erchuan_wenan: values.erchuan_wenan,
          language: values.language,
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 8, 95));
          setJsonText((prev) => `${prev}${prev ? '\n' : ''}${JSON.stringify(data, null, 2)}`);

          if (typeof data === 'string') {
            setStreamText((prev) => `${prev}${prev ? '\n' : ''}${data}`);
            return;
          }

          const eventObj = data as { event?: string; data?: { content?: string } };

          if (eventObj.event === 'Message' && eventObj.data?.content) {
            const content = eventObj.data.content;
            try {
              const parsed = JSON.parse(content) as {
                output?: string;
                result?: string;
                text?: string;
              };
              const outputText = parsed.output || parsed.result || parsed.text || content;
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${outputText}`);
            } catch {
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${content}`);
            }
          }
        },
        () => {
          setProgress(100);
          setLoading(false);
          message.success('翻译完成');
        },
        (err) => {
          setLoading(false);
          setErrorText(err || '翻译失败');
          message.error(err || '翻译失败');
        }
      );
    } catch (error) {
      setLoading(false);
      const msg = error instanceof Error ? error.message : '翻译失败';
      setErrorText(msg);
      message.error(msg);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            翻译功能
          </Typography.Title>
          <Typography.Text type="secondary">
            输入中文文案并选择目标语言，自动生成翻译结果
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical" form={form} initialValues={{ language: 'thai' }}>
            <Form.Item
              label="待翻译文案"
              name="erchuan_wenan"
              rules={[{ required: true, message: '请输入待翻译文案' }]}
            >
              <Input.TextArea rows={8} placeholder="请输入需要翻译的中文文案" />
            </Form.Item>

            <Form.Item
              label="目标语言"
              name="language"
              rules={[{ required: true, message: '请选择目标语言' }]}
            >
              <Select options={languageOptions} placeholder="请选择目标语言" />
            </Form.Item>

            <Button type="primary" loading={loading} onClick={handleSubmit}>
              开始翻译
            </Button>
          </Form>
        </Card>

        <ResultPanel
          title="翻译结果"
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

export default TranslationPage;