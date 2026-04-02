import { Button, Card, Form, Input, Select, Space, Typography, message, Divider, List, Tag } from 'antd';
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
  const [ttsResults, setTtsResults] = useState<{
    individual?: Array<{ line: string; index: number; tts?: unknown; error?: string }>;
    merged?: { txt: string; tts?: unknown; error?: string };
  } | null>(null);

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
        (errMsg: string) => {
          setLoading(false);
          setErrorText(errMsg);
        }
      );
    } catch (error) {
      setLoading(false);
      setErrorText(error instanceof Error ? error.message : '未知错误');
    }
  };

  const handleTranslate = async () => {
    if (!streamText) {
      message.warning('请先生成文案');
      return;
    }

    setTranslateLoading(true);
    setTranslatedText('');
    setTranslatedJson('');
    setTranslatedLines([]);

    try {
      const res = await translateLinesFromCopy(streamText);
      const lines: string[] = res.data?.translatedLines || [];
      setTranslatedLines(lines);
      setTranslatedText(lines.join('\n'));
      setTranslatedJson(JSON.stringify(res, null, 2));
      message.success(`翻译完成，共 ${lines.length} 条`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '翻译失败';
      message.error(msg);
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
    setTtsResults(null);

    try {
      const res = await ttsFromLines(translatedLines, 'both');
      setTtsResults(res.data.results);
      message.success('语音生成完成（逐条+合并）');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '语音生成失败';
      message.error(msg);
      setTtsResults(null);
    } finally {
      setTtsLoading(false);
    }
  };

  const getAudioUrl = (ttsData: unknown): string | null => {
    if (!ttsData || typeof ttsData !== 'object') return null;
    const data = ttsData as { data?: Array<{ url?: string }> };
    if (data.data && data.data.length > 0 && data.data[0].url) {
      return data.data[0].url;
    }
    return null;
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
                生成文案
              </Button>
              <Button loading={translateLoading} onClick={handleTranslate} disabled={!streamText}>
                独立英译
              </Button>
              <Button loading={ttsLoading} onClick={handleTtsFromTranslatedLines} disabled={!translatedLines.length}>
                生成语音
              </Button>
            </Space>
          </Form>
        </Card>

        <Card className="form-section">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            流程：1) 开始生成 -&gt; 2) 独立英译（得到 translatedLines）-&gt; 3) 生成语音（把 translatedLines 传给 TTS，批量处理并导出SRT）
          </Typography.Text>
        </Card>

        <ResultPanel
          title="生成结果"
          type="primary"
          streamText={streamText}
          jsonText={jsonText}
          loading={loading}
          progress={progress}
          errorText={errorText}
          onCopyText={() => navigator.clipboard.writeText(streamText)}
          onCopyJson={() => navigator.clipboard.writeText(jsonText)}
        />

        <ResultPanel
          title="独立英译结果"
          type="success"
          streamText={translatedText || '等待英译结果...'}
          jsonText={translatedJson}
          loading={translateLoading}
          progress={translateLoading ? 60 : 100}
          onCopyText={() => navigator.clipboard.writeText(translatedText)}
          onCopyJson={() => navigator.clipboard.writeText(translatedJson)}
        />

        {ttsResults && (
          <Card title="🎵 生成的音频" className="form-section">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {ttsResults.individual && ttsResults.individual.length > 0 && (
                <div>
                  <Divider orientation="left">
                    <Tag color="blue">逐条配音 ({ttsResults.individual.length}条)</Tag>
                  </Divider>
                  <List
                    size="small"
                    dataSource={ttsResults.individual}
                    renderItem={(item, index) => {
                      const audioUrl = getAudioUrl(item.tts);
                      return (
                        <List.Item>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            <Typography.Text type="secondary">{index + 1}. {item.line.slice(0, 60)}{item.line.length > 60 ? '...' : ''}</Typography.Text>
                            {audioUrl ? (
                              <audio controls style={{ width: '100%' }}>
                                <source src={audioUrl} type="audio/wav" />
                              </audio>
                            ) : item.error ? (
                              <Typography.Text type="danger">生成失败: {item.error}</Typography.Text>
                            ) : (
                              <Typography.Text type="warning">音频未生成</Typography.Text>
                            )}
                          </Space>
                        </List.Item>
                      );
                    }}
                  />
                </div>
              )}

              {ttsResults.merged && (
                <div>
                  <Divider orientation="left">
                    <Tag color="green">合并配音</Tag>
                  </Divider>
                  {(() => {
                    const audioUrl = getAudioUrl(ttsResults.merged?.tts);
                    return audioUrl ? (
                      <audio controls style={{ width: '100%' }}>
                        <source src={audioUrl} type="audio/wav" />
                      </audio>
                    ) : ttsResults.merged?.error ? (
                      <Typography.Text type="danger">生成失败: {ttsResults.merged.error}</Typography.Text>
                    ) : (
                      <Typography.Text type="warning">音频未生成</Typography.Text>
                    );
                  })()}
                </div>
              )}
            </Space>
          </Card>
        )}
      </Space>
    </div>
  );
};

export default ProductCopyPage;
