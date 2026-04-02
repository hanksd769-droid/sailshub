import { Alert, Button, Card, Form, Input, Select, Space, Typography, message, Divider, List, Tag, Progress } from 'antd';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, translateLinesFromCopy, ttsFromLines } from '../lib/api';

const templateOptions = [
  { label: '知识科普', value: '知识科普' },
  { label: '种草推荐', value: '种草推荐' },
  { label: '直播带货', value: '直播带货' },
  { label: '强对�?, value: '强对�? },
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
  const [ttsResults, setTtsResults] = useState<{
    individual?: Array<{ line: string; index: number; tts?: unknown; error?: string }>;
    merged?: { txt: string; tts?: unknown; error?: string };
  } | null>(null);

  // V2 功能状�?  const [v2Loading, setV2Loading] = useState(false);
  const [v2Progress, setV2Progress] = useState(0);
  const [v2Result, setV2Result] = useState<{
    buwei?: string[];
    changping?: string;
    donzuojiexi?: string[];
    koubo_mp3_Array?: string[];
    koubo_mp3_hebin?: string;
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
      message.warning('请先点击“开始生成”得到文案结�?);
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
      setTranslatedText(`英译失败�?{msg}`);
    } finally {
      setTranslateLoading(false);
    }
  };

  const handleTtsFromTranslatedLines = async () => {
    if (!translatedLines.length) {
      message.warning('请先执行独立英译，得到英文数组后再生成语�?);
      return;
    }

    setTtsLoading(true);
    setTtsText('');
    setTtsJson('');

    try {
      const res = await ttsFromLines(translatedLines, 'both');
      setTtsResults(res.data.results);

      const resultLines = ['语音生成完成（逐条 + 合并�?, ''];

      // 显示逐条配音结果
      if (res.data.results?.individual) {
        resultLines.push(`【逐条配音】共 ${res.data.results.individual.length} 条`);
        res.data.results.individual.forEach((item: { line: string; index: number }) => {
          resultLines.push(`${item.index + 1}. ${item.line.slice(0, 50)}${item.line.length > 50 ? '...' : ''}`);
        });
        resultLines.push('');
      }

      // 显示合并配音结果
      if (res.data.results?.merged) {
        resultLines.push('【合并配音�?);
        resultLines.push(res.data.results.merged.txt?.slice(0, 100) + '...' || '');
      }

      setTtsText(resultLines.join('\n'));
      setTtsJson(JSON.stringify(res, null, 2));
      message.success('语音生成完成（逐条+合并�?);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '语音生成失败';
      message.error(msg);
      setTtsText(`语音生成失败�?{msg}`);
      setTtsResults(null);
    } finally {
      setTtsLoading(false);
    }
  };

  // 提取音频URL
  const getAudioUrl = (ttsData: unknown): string | null => {
    if (!ttsData || typeof ttsData !== 'object') return null;
    const data = ttsData as { data?: Array<{ url?: string }> };
    if (data.data && data.data.length > 0 && data.data[0].url) {
      return data.data[0].url;
    }
    return null;
  };

  // V2 功能：导入上一步数�?  const handleImportData = () => {
    try {
      const lastResult = streamText;
      if (!lastResult) {
        message.warning('请先生成文案');
        return;
      }
      const parsed = JSON.parse(lastResult);
      setV2Result({
        buwei: parsed.buwei || [],
        changping: parsed.changping || '',
        donzuojiexi: parsed.donzuojiexi || [],
      });
      message.success('数据导入成功');
    } catch {
      message.error('导入失败，请确保已生成有效文�?);
    }
  };

  // V2 功能：开始生成（调用带音频的工作流）
  const handleGenerateV2 = async () => {
    if (!v2Result || !v2Result.buwei || !v2Result.changping) {
      message.warning('请先导入数据');
      return;
    }

    setV2Loading(true);
    setV2Progress(5);

    try {
      await runWorkflowStream(
        'product-copy-v2',
        {
          buwei: v2Result.buwei,
          changping: v2Result.changping,
          donzuojiexi: v2Result.donzuojiexi,
        },
        (data) => {
          setV2Progress((prev) => Math.min(prev + 10, 95));
          // 解析返回的音频URL
          if (typeof data === 'object' && data !== null) {
            const d = data as { koubo_mp3_Array?: string[]; koubo_mp3_hebin?: string };
            if (d.koubo_mp3_Array || d.koubo_mp3_hebin) {
              setV2Result((prev) => ({
                ...prev,
                koubo_mp3_Array: d.koubo_mp3_Array,
                koubo_mp3_hebin: d.koubo_mp3_hebin,
              }));
            }
          }
        },
        () => {
          setV2Progress(100);
          setV2Loading(false);
          message.success('音频生成完成');
        },
        (errMsg: string) => {
          setV2Loading(false);
          message.error(errMsg || '生成失败');
        }
      );
    } catch (error) {
      setV2Loading(false);
      message.error('生成失败');
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
              rules={[{ required: true, message: '请输入产品名�? }]}
            >
              <Input placeholder="例如�?77美白双管身体�? />
            </Form.Item>

            <Form.Item
              label="卖点文案"
              name="maidian"
              rules={[{ required: true, message: '请输入卖点文�? }]}
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
                开始生�?              </Button>

              <Button loading={translateLoading} onClick={handleTranslateOnly}>
                独立英译（仅翻译�?              </Button>

              <Button loading={ttsLoading} onClick={handleTtsFromTranslatedLines}>
                生成语音（MP3+SRT�?              </Button>
            </Space>
          </Form>
        </Card>

        <Alert
          type="info"
          showIcon
          message="流程说明"
          description="1) 开始生�?-> 2) 独立英译（得�?translatedLines�?> 3) 生成语音（把 translatedLines 传给 TTS，批量处理并导出SRT�?
        />

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

        {/* 音频播放区域 */}
        {ttsResults && (
          <Card title="🎵 生成的音�? className="form-section">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* 逐条配音音频 */}
              {ttsResults.individual && ttsResults.individual.length > 0 && (
                <div>
                  <Divider orientation="left">
                    <Tag color="blue">逐条配音 ({ttsResults.individual.length}�?</Tag>
                  </Divider>
                  <List
                    size="small"
                    dataSource={ttsResults.individual}
                    renderItem={(item, index) => {
                      const audioUrl = getAudioUrl(item.tts);
                      return (
                        <List.Item>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            <Typography.Text type="secondary">{index + 1}. {item.line.slice(0, 50)}{item.line.length > 50 ? '...' : ''}</Typography.Text>
                            {audioUrl ? (
                              <audio controls style={{ width: '100%' }}>
                                <source src={audioUrl} type="audio/wav" />
                                您的浏览器不支持音频播放
                              </audio>
                            ) : item.error ? (
                              <Typography.Text type="danger">生成失败: {item.error}</Typography.Text>
                            ) : (
                              <Typography.Text type="warning">音频未生�?/Typography.Text>
                            )}
                          </Space>
                        </List.Item>
                      );
                    }}
                  />
                </div>
              )}

              {/* 合并配音音频 */}
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
                        您的浏览器不支持音频播放
                      </audio>
                    ) : ttsResults.merged?.error ? (
                      <Typography.Text type="danger">生成失败: {ttsResults.merged.error}</Typography.Text>
                    ) : (
                      <Typography.Text type="warning">音频未生�?/Typography.Text>
                    );
                  })()}
                </div>
              )}
            </Space>
          </Card>
        )}

        {/* V2 功能：一键导�?+ 生成音频 */}
        <Card title="🎬 产品文案生成V2（带音频�? className="form-section">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              导入上一步生成的文案数据，调�?Coze 工作流生成带音频的完整结�?            </Typography.Text>
            
            <Space>
              <Button type="default" onClick={handleImportData} disabled={!streamText}>
                导入数据
              </Button>
              <Button 
                type="primary" 
                loading={v2Loading} 
                onClick={handleGenerateV2}
                disabled={!v2Result?.buwei}
              >
                开始生�?              </Button>
            </Space>

            {v2Progress > 0 && v2Progress < 100 && (
              <Progress percent={v2Progress} size="small" />
            )}

            {/* 显示导入的数�?*/}
            {v2Result && (
              <div style={{ background: '#f6f8fa', padding: 16, borderRadius: 8 }}>
                <Typography.Text strong>已导入数据：</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  {v2Result.buwei && (
                    <Tag color="blue">部位: {v2Result.buwei.join(', ')}</Tag>
                  )}
                  {v2Result.changping && (
                    <Tag color="green">产品: {v2Result.changping}</Tag>
                  )}
                  {v2Result.donzuojiexi && (
                    <Tag color="orange">动作解析: {v2Result.donzuojiexi.length} �?/Tag>
                  )}
                </div>
              </div>
            )}

            {/* 显示生成的音�?*/}
            {v2Result?.koubo_mp3_Array && v2Result.koubo_mp3_Array.length > 0 && (
              <div>
                <Divider orientation="left">
                  <Tag color="blue">逐条音频 ({v2Result.koubo_mp3_Array.length}�?</Tag>
                </Divider>
                <List
                  size="small"
                  dataSource={v2Result.koubo_mp3_Array}
                  renderItem={(url, index) => (
                    <List.Item>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Typography.Text type="secondary">音频 {index + 1}</Typography.Text>
                        <audio controls style={{ width: '100%' }}>
                          <source src={url} type="audio/wav" />
                          您的浏览器不支持音频播放
                        </audio>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            )}

            {v2Result?.koubo_mp3_hebin && (
              <div>
                <Divider orientation="left">
                  <Tag color="green">合并音频</Tag>
                </Divider>
                <audio controls style={{ width: '100%' }}>
                  <source src={v2Result.koubo_mp3_hebin} type="audio/wav" />
                  您的浏览器不支持音频播放
                </audio>
              </div>
            )}
          </Space>
        </Card>
      </Space>
    </div>
  );
};

export default ProductCopyPage;