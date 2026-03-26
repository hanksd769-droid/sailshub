import { Alert, Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { generateVoiceFromCopy, runWorkflowStream } from '../lib/api';

const templateOptions = [
  { label: '知识科普', value: '知识科普' },
  { label: '种草推荐', value: '种草推荐' },
  { label: '直播带货', value: '直播带货' },
  { label: '强对比', value: '强对比' },
];

const ProductCopyPage = () => {
  const [streamText, setStreamText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceResultText, setVoiceResultText] = useState('');
  const [voiceResultJson, setVoiceResultJson] = useState('');
  const [form] = Form.useForm();

  const handleGenerateVoice = async () => {
    if (!streamText.trim()) {
      message.warning('请先生成文案，再执行文案生成语音');
      return;
    }

    setVoiceLoading(true);
    setVoiceResultText('');
    setVoiceResultJson('');

    try {
      const result = await generateVoiceFromCopy(streamText);
      const translated = result.data.translated || '';
      const lines = result.data.lines || [];

      setVoiceResultText([
        '英文翻译：',
        translated,
        '',
        '逐句分行（TXT内容）：',
        ...lines,
      ].join('\n'));
      setVoiceResultJson(JSON.stringify(result.data, null, 2));
      message.success('语音任务已提交（批量处理 + 导出 SRT）');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '语音生成失败';
      message.error(msg);
      setVoiceResultText(`语音生成失败：${msg}`);
    } finally {
      setVoiceLoading(false);
    }
  };

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
            const content = eventObj.data.content;
            try {
              const parsed = JSON.parse(content) as { output?: string };
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${parsed.output || content}`);
            } catch {
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${content}`);
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

            <Space>
              <Button type="primary" loading={loading} onClick={handleSubmit}>
                开始生成
              </Button>
              <Button loading={voiceLoading} onClick={handleGenerateVoice}>
                文案生成语音（英译+分句+SRT）
              </Button>
            </Space>
          </Form>
        </Card>

        <Alert
          type="info"
          showIcon
          message="语音子功能说明"
          description="点击“文案生成语音”后，会自动将产品文案翻译成英文，按一句一行生成 TXT，并调用语音服务进行批量处理及导出 SRT。"
        />

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

        <ResultPanel
          title="语音任务结果（MP3+SRT）"
          streamText={voiceResultText || '等待语音任务输出...'}
          jsonText={voiceResultJson}
          loading={voiceLoading}
          progress={voiceLoading ? 60 : 100}
          onCopyText={() => navigator.clipboard.writeText(voiceResultText)}
          onCopyJson={() => navigator.clipboard.writeText(voiceResultJson)}
        />
      </Space>
    </div>
  );
};

export default ProductCopyPage;
