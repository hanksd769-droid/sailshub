import { Button, Card, Form, Input, Space, Typography, message, List, Tag, Divider, Select } from 'antd';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { runWorkflowStream, getCopyLibrary, batchUploadAudioFromUrls, type CopyLibraryItem } from '../lib/api';

const MixCutPage = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    koubo_mp3_Array?: string[];
    koubo_mp3_hebin?: string;
  } | null>(null);

  const [copyLibrary, setCopyLibrary] = useState<CopyLibraryItem[]>([]);
  const [selectedCopyId, setSelectedCopyId] = useState<number | null>(null);

  const [form] = Form.useForm();

  // 加载文案库
  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const res = await getCopyLibrary();
        if (res.success) {
          setCopyLibrary(res.data);
        }
      } catch {
        // 忽略错误
      }
    };
    fetchLibrary();
  }, []);

  // 从文案库页面跳转过来的数据
  useEffect(() => {
    const state = location.state as { copyData?: CopyLibraryItem } | null;
    if (state?.copyData) {
      const data = state.copyData;
      // 提取音频URL
      const kouboArray: string[] = [];
      if (data.tts_individual) {
        for (const item of data.tts_individual) {
          const tts = item.tts as { data?: { url?: string }[] } | undefined;
          if (tts?.data?.[0]?.url) {
            kouboArray.push(tts.data[0].url);
          }
        }
      }
      // tts_merged 的结构是 { txt: string, tts: result }
      const mergedData = data.tts_merged as { txt?: string; tts?: { data?: { url?: string }[] } } | undefined;
      const kouboHebin = mergedData?.tts?.data?.[0]?.url || '';

      form.setFieldsValue({
        buwei: data.buwei?.join('\n'),
        changping: data.name || data.changping,
        donzuojiexi: data.donzuojiexi?.join('\n'),
        koubo_mp3_Array: kouboArray.join('\n'),
        koubo_mp3_hebin: kouboHebin,
      });
      // 清除 state
      window.history.replaceState({}, document.title);
    }
  }, [location.state, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();

    setLoading(true);
    setProgress(5);
    setResult(null);

    try {
      // 收集需要上传的音频 URL
      const audioUrls: string[] = [];
      if (values.koubo_mp3_Array) {
        const urls = values.koubo_mp3_Array.split('\n').filter((s: string) => s.trim());
        audioUrls.push(...urls);
      }
      if (values.koubo_mp3_hebin) {
        audioUrls.push(values.koubo_mp3_hebin);
      }

      // 上传音频到 Coze 获取 file_id
      let kouboFileIds: string[] = [];
      let hebinFileId = '';

      if (audioUrls.length > 0) {
        message.loading(`正在上传 ${audioUrls.length} 个音频文件到 Coze...`, 0);
        const uploadRes = await batchUploadAudioFromUrls(audioUrls);
        message.destroy();

        if (uploadRes.data?.results) {
          // 分离口播音频和合并音频的 file_id
          const individualCount = values.koubo_mp3_Array?.split('\n').filter((s: string) => s.trim()).length || 0;
          kouboFileIds = uploadRes.data.results
            .slice(0, individualCount)
            .map((r) => r.file_id);
          if (uploadRes.data.results.length > individualCount) {
            hebinFileId = uploadRes.data.results[individualCount]?.file_id || '';
          }

          if (uploadRes.data.error_count > 0) {
            message.warning(`${uploadRes.data.error_count} 个音频上传失败`);
          }
        }
      }

      setProgress(30);

      await runWorkflowStream(
        'product-copy-v2',
        {
          buwei: values.buwei?.split('\n').filter((s: string) => s.trim()),
          changping: values.changping,
          donzuojiexi: values.donzuojiexi?.split('\n').filter((s: string) => s.trim()),
          koubo_mp3_Array: kouboFileIds,
          koubo_mp3_hebin: hebinFileId,
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 10, 95));
          if (typeof data === 'object' && data !== null) {
            const d = data as { koubo_mp3_Array?: string[]; koubo_mp3_hebin?: string };
            if (d.koubo_mp3_Array || d.koubo_mp3_hebin) {
              setResult({
                koubo_mp3_Array: d.koubo_mp3_Array,
                koubo_mp3_hebin: d.koubo_mp3_hebin,
              });
            }
          }
        },
        () => {
          setProgress(100);
          setLoading(false);
          message.success('混剪生成完成');
        },
        (errMsg: string) => {
          setLoading(false);
          message.error(errMsg || '生成失败');
        }
      );
    } catch (error) {
      setLoading(false);
      message.error('生成失败');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            混剪功能
          </Typography.Title>
          <Typography.Text type="secondary">
            输入所有参数，生成混剪所需的 JSON 链接
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 从文案库选择 */}
        {copyLibrary.length > 0 && (
          <Card className="form-section">
            <Form.Item label="从文案库导入" style={{ marginBottom: 0 }}>
              <Select
                placeholder="选择已保存的文案"
                allowClear
                style={{ width: '100%' }}
                options={copyLibrary.map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                onChange={(value) => {
                  const item = copyLibrary.find((i) => i.id === value);
                  if (item) {
                    // 提取音频URL
                    const kouboArray: string[] = [];
                    if (item.tts_individual) {
                      for (const t of item.tts_individual) {
                        const tts = t.tts as { data?: { url?: string }[] } | undefined;
                        if (tts?.data?.[0]?.url) {
                          kouboArray.push(tts.data[0].url);
                        }
                      }
                    }
                    // tts_merged 的结构是 { txt: string, tts: result }
                    const mergedData = item.tts_merged as { txt?: string; tts?: { data?: { url?: string }[] } } | undefined;
                    const kouboHebin = mergedData?.tts?.data?.[0]?.url || '';

                    form.setFieldsValue({
                      buwei: item.buwei?.join('\n'),
                      changping: item.name || item.changping,
                      donzuojiexi: item.donzuojiexi?.join('\n'),
                      koubo_mp3_Array: kouboArray.join('\n'),
                      koubo_mp3_hebin: kouboHebin,
                    });
                    setSelectedCopyId(value);
                    message.success(`已导入：${item.name}`);
                  }
                }}
              />
            </Form.Item>
          </Card>
        )}

        <Card className="form-section">
          <Form
            layout="vertical"
            form={form}
            initialValues={{
              buwei: '脸\n产品\n脸\n产品',
              changping: '水杨酸精准点痘精华',
              donzuojiexi: '使用前+使用后效果\n介绍产品\n使用中效果\n引导购买效果',
            }}
          >
            <Form.Item
              label="部位 (buwei)"
              name="buwei"
              rules={[{ required: true, message: '请输入部位' }]}
            >
              <Input.TextArea
                rows={4}
                placeholder="每行一个部位，例如：&#10;脸&#10;产品&#10;脸&#10;产品"
              />
            </Form.Item>

            <Form.Item
              label="产品名称 (changping)"
              name="changping"
              rules={[{ required: true, message: '请输入产品名称' }]}
            >
              <Input placeholder="例如：水杨酸精准点痘精华" />
            </Form.Item>

            <Form.Item
              label="动作解析 (donzuojiexi)"
              name="donzuojiexi"
              rules={[{ required: true, message: '请输入动作解析' }]}
            >
              <Input.TextArea
                rows={4}
                placeholder="每行一个动作，例如：&#10;使用前+使用后效果&#10;介绍产品&#10;使用中效果&#10;引导购买效果"
              />
            </Form.Item>

            <Form.Item
              label="口播音频数组 (koubo_mp3_Array)"
              name="koubo_mp3_Array"
            >
              <Input.TextArea
                rows={4}
                placeholder="每行一个音频URL（可选，如不提供将由系统生成）"
              />
            </Form.Item>

            <Form.Item
              label="合并音频 (koubo_mp3_hebin)"
              name="koubo_mp3_hebin"
            >
              <Input.TextArea
                rows={2}
                placeholder="合并后的音频URL（可选，如不提供将由系统生成）"
              />
            </Form.Item>

            <Button type="primary" loading={loading} onClick={handleSubmit}>
              开始生成
            </Button>
          </Form>
        </Card>

        {progress > 0 && progress < 100 && (
          <Card className="form-section">
            <Typography.Text>生成进度</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  width: '100%',
                  height: 8,
                  background: '#f0f0f0',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: '#1890ff',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <Typography.Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
                {progress}%
              </Typography.Text>
            </div>
          </Card>
        )}

        {result && (
          <Card title="生成结果" className="form-section">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {result.koubo_mp3_Array && result.koubo_mp3_Array.length > 0 && (
                <div>
                  <Divider orientation="left">
                    <Tag color="blue">逐条音频 ({result.koubo_mp3_Array.length}条)</Tag>
                  </Divider>
                  <List
                    size="small"
                    bordered
                    dataSource={result.koubo_mp3_Array}
                    renderItem={(url, index) => (
                      <List.Item>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Typography.Text type="secondary">音频 {index + 1}</Typography.Text>
                          <Typography.Text copyable style={{ fontSize: 12 }}>
                            {url}
                          </Typography.Text>
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

              {result.koubo_mp3_hebin && (
                <div>
                  <Divider orientation="left">
                    <Tag color="green">合并音频</Tag>
                  </Divider>
                  <Typography.Text copyable style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    {result.koubo_mp3_hebin}
                  </Typography.Text>
                  <audio controls style={{ width: '100%' }}>
                    <source src={result.koubo_mp3_hebin} type="audio/wav" />
                    您的浏览器不支持音频播放
                  </audio>
                </div>
              )}
            </Space>
          </Card>
        )}
      </Space>
    </div>
  );
};

export default MixCutPage;
