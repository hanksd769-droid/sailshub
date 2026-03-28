import { Alert, Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, translateLinesFromCopy, ttsFromLines } from '../lib/api';

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

  const [translateLoading, setTranslateLoading] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [translatedJson, setTranslatedJson] = useState('');
  const [translatedLines, setTranslatedLines] = useState<string[]>([]);

  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsJson, setTtsJson] = useState('');

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

  const handleTranslateOnly = async () => {
    if (!streamText.trim()) {
      message.warning('请先点击“开始生成”得到文案结果');
      return;
    }

    setTranslateLoading(true);
    setTranslatedText('');
    setTranslatedJson('');
    setTranslatedLines([]);

    try {
      const res = await translateLinesFromCopy(streamText);
      const lines = Array.isArray(res.data.translatedLines) ? res.data.translatedLines : [];
      const oneLinePerItem = lines.map((x) => String(x).trim()).filter(Boolean);

      setTranslatedLines(oneLinePerItem);
      setTranslatedText(oneLinePerItem.join('\n'));
      setTranslatedJson(JSON.stringify(res, null, 2));
      message.success('英译完成（独立步骤）');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '英译失败';
      message.error(msg);
      setTranslatedText(`英译失败：${msg}`);
    } finally {
      setTranslateLoading(false);
    }
  };

  const handleTtsFromTranslatedLines = async () => {
    if (!translatedLines.length) {
      message.warning('请先执行独立英译，得到英文数组后再生成语音');
      return;
    }

    setTtsLoading(true);
    setTtsText('');
    setTtsJson('');

    try {
      const res = await ttsFromLines(translatedLines);

      setTtsText([
        '语音任务已执行（批量 + 导出SRT）',
        '',
        '输入英文（每行一句）：',
        ...(res.data.lines || []),
      ].join('\n'));

      setTtsJson(JSON.stringify(res, null, 2));
      message.success('语音生成请求完成（含SRT）');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '语音生成失败';
      message.error(msg);
      setTtsText(`语音生成失败：${msg}`);
    } finally {
      setTtsLoading(false);
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
            先生成文案，再独立英译，最后把英译数组交给 TTS 生成 MP3+SRT
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

              <Button loading={translateLoading} onClick={handleTranslateOnly}>
                独立英译（仅翻译）
              </Button>

              <Button loading={ttsLoading} onClick={handleTtsFromTranslatedLines}>
                生成语音（MP3+SRT）
              </Button>
            </Space>
          </Form>
        </Card>

        <Alert
          type="info"
          showIcon
          message="流程说明"
          description="1) 开始生成 -> 2) 独立英译（得到 translatedLines）-> 3) 生成语音（把 translatedLines 传给 TTS，批量处理并导出SRT）"
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
          title="独立英译结果（每行一条）"
          streamText={translatedText || '等待英译结果...'}
          jsonText={translatedJson}
          loading={translateLoading}
          progress={translateLoading ? 60 : 100}
          onCopyText={() => navigator.clipboard.writeText(translatedText)}
          onCopyJson={() => navigator.clipboard.writeText(translatedJson)}
        />

        <ResultPanel
          title="语音任务结果（MP3+SRT）"
          streamText={ttsText || '等待语音结果...'}
          jsonText={ttsJson}
          loading={ttsLoading}
          progress={ttsLoading ? 60 : 100}
          onCopyText={() => navigator.clipboard.writeText(ttsText)}
          onCopyJson={() => navigator.clipboard.writeText(ttsJson)}
        />
      </Space>
    </div>
  );
};

export default ProductCopyPage;