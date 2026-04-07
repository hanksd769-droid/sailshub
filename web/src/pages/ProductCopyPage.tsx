import { Button, Card, Form, Input, Select, Space, Typography, message, Divider, List, Tag, Modal } from 'antd';
import { RedoOutlined } from '@ant-design/icons';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, translateLinesFromCopy, ttsFromLines, createCopyLibraryItem } from '../lib/api';

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

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveForm] = Form.useForm();

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

    // 自动重试机制
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await translateLinesFromCopy(streamText);
        const lines: string[] = res.data?.translatedLines || [];
        if (lines.length > 0) {
          setTranslatedLines(lines);
          setTranslatedText(lines.join('\n'));
          setTranslatedJson(JSON.stringify(res, null, 2));
          message.success(`翻译完成，共 ${lines.length} 条`);
          setTranslateLoading(false);
          return;
        }
        // 如果返回空数组，继续重试
        if (attempt < maxRetries) {
          message.loading(`第 ${attempt} 次尝试未获取到结果，正在重试...`, 1);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('翻译失败');
        if (attempt < maxRetries) {
          message.loading(`第 ${attempt} 次尝试失败，正在重试...`, 1);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    // 所有重试都失败了
    setTranslateLoading(false);
    const errorMsg = lastError?.message || '翻译失败，请稍后重试';
    message.error(errorMsg);
  };

  const handleTtsFromTranslatedLines = async () => {
    if (!translatedLines.length) {
      message.warning('请先执行独立英译，得到英文数组后再生成语音');
      return;
    }

    setTtsLoading(true);
    setTtsResults(null);

    // 自动重试机制
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await ttsFromLines(translatedLines, 'both');
        if (res.data?.results?.individual || res.data?.results?.merged) {
          setTtsResults(res.data.results);
          message.success('语音生成完成（逐条+合并）');
          setTtsLoading(false);
          return;
        }
        // 如果返回空结果，继续重试
        if (attempt < maxRetries) {
          message.loading(`第 ${attempt} 次尝试未获取到结果，正在重试...`, 1);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('语音生成失败');
        if (attempt < maxRetries) {
          message.loading(`第 ${attempt} 次尝试失败，正在重试...`, 1);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    // 所有重试都失败了
    setTtsLoading(false);
    const errorMsg = lastError?.message || '语音生成失败，请稍后重试';
    message.error(errorMsg);
    setTtsResults(null);
  };

  const getAudioUrl = (ttsData: unknown): string | null => {
    if (!ttsData || typeof ttsData !== 'object') return null;
    const data = ttsData as { data?: Array<{ url?: string }> };
    if (data.data && data.data.length > 0 && data.data[0].url) {
      return data.data[0].url;
    }
    return null;
  };

  // 单条语音重试
  const handleRetrySingleTts = async (index: number) => {
    if (!ttsResults?.individual || !translatedLines[index]) return;

    const line = translatedLines[index];
    message.loading(`正在重试第 ${index + 1} 条语音...`, 0);

    try {
      const res = await ttsFromLines([line], 'individual');
      message.destroy();

      if (res.data?.results?.individual?.[0]) {
        // 更新单条结果
        const newIndividual = [...ttsResults.individual];
        newIndividual[index] = res.data.results.individual[0];
        setTtsResults({ ...ttsResults, individual: newIndividual });
        message.success(`第 ${index + 1} 条语音重试成功`);
      } else {
        message.error(`第 ${index + 1} 条语音重试失败`);
      }
    } catch (error) {
      message.destroy();
      message.error(`第 ${index + 1} 条语音重试失败`);
    }
  };

  // 保存到文案库
  const handleSaveToLibrary = async (values: { name: string }) => {
    try {
      // 解析生成结果
      let buwei: string[] = [];
      let changping = '';
      let donzuojiexi: string[] = [];
      let erchuanwenan = '';
      let wenan_array_string: string[] = [];
      let wenan_fenxi = '';

      try {
        const parsed = JSON.parse(streamText);
        buwei = parsed.buwei || [];
        changping = parsed.changping || '';
        donzuojiexi = parsed.donzuojiexi || [];
        erchuanwenan = parsed.erchuanwenan || '';
        wenan_array_string = parsed.wenan_Array_string || [];
        wenan_fenxi = parsed.wenan_fenxi || '';
      } catch {
        // 解析失败使用空值
      }

      await createCopyLibraryItem({
        name: values.name,
        buwei,
        changping,
        donzuojiexi,
        erchuanwenan,
        wenan_array_string,
        wenan_fenxi,
        translated_lines: translatedLines,
        tts_individual: ttsResults?.individual,
        tts_merged: ttsResults?.merged,
      });

      message.success('保存到文案库成功');
      setIsSaveModalOpen(false);
      saveForm.resetFields();
    } catch (error) {
      message.error('保存失败');
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
                      const hasError = item.error || !audioUrl;
                      return (
                        <List.Item>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Typography.Text type="secondary">{index + 1}. {item.line.slice(0, 60)}{item.line.length > 60 ? '...' : ''}</Typography.Text>
                              {hasError && (
                                <Button
                                  type="primary"
                                  size="small"
                                  icon={<RedoOutlined />}
                                  onClick={() => handleRetrySingleTts(index)}
                                >
                                  重试
                                </Button>
                              )}
                            </Space>
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

        {/* 保存到文案库按钮 */}
        {(streamText || translatedLines.length > 0 || ttsResults) && (
          <Card className="form-section">
            <Button type="primary" onClick={() => setIsSaveModalOpen(true)}>
              保存到文案库
            </Button>
          </Card>
        )}
      </Space>

      {/* 保存到文案库模态框 */}
      <Modal
        title="保存到文案库"
        open={isSaveModalOpen}
        onCancel={() => setIsSaveModalOpen(false)}
        footer={null}
      >
        <Form form={saveForm} layout="vertical" onFinish={handleSaveToLibrary}>
          <Form.Item
            label="文案名称"
            name="name"
            rules={[{ required: true, message: '请输入文案名称' }]}
          >
            <Input placeholder="例如：水杨酸精华文案" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => setIsSaveModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductCopyPage;
