import { Button, Card, Form, Input, Radio, Select, Space, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, uploadFile } from '../lib/api';

const languageOptions = [
  { value: '16k_zh-PY', label: '中英粤 (16k_zh-PY)' },
  { value: '16k_yue', label: '粤语 (16k_yue)' },
  { value: '16k_en', label: '英语 (16k_en)' },
  { value: '16k_ja', label: '日语 (16k_ja)' },
  { value: '16k_ko', label: '韩语 (16k_ko)' },
  { value: '16k_vi', label: '越南语 (16k_vi)' },
  { value: '16k_ms', label: '马来语 (16k_ms)' },
  { value: '16k_id', label: '印度尼西亚语 (16k_id)' },
  { value: '16k_fil', label: '菲律宾语 (16k_fil)' },
  { value: '16k_th', label: '泰语 (16k_th)' },
  { value: '16k_pt', label: '葡萄牙语 (16k_pt)' },
  { value: '16k_tr', label: '土耳其语 (16k_tr)' },
  { value: '16k_ar', label: '阿拉伯语 (16k_ar)' },
  { value: '16k_es', label: '西班牙语 (16k_es)' },
  { value: '16k_hi', label: '印地语 (16k_hi)' },
  { value: '16k_fr', label: '法语 (16k_fr)' },
  { value: '16k_de', label: '德语 (16k_de)' },
];

type InputMode = 'url' | 'upload';

const VideoCopyPage = () => {
  const [streamText, setStreamText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [mode, setMode] = useState<InputMode>('url');
  const [form] = Form.useForm();

  const parseOutputFromEvent = (data: unknown): string | null => {
    if (typeof data === 'string') return data;

    const eventObj = data as { event?: string; data?: { content?: string } };
    if (eventObj.event !== 'Message' || !eventObj.data?.content) return null;

    try {
      const parsed = JSON.parse(eventObj.data.content) as { output?: string };
      return parsed.output ?? eventObj.data.content;
    } catch {
      return eventObj.data.content;
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
      let inputValue: string;

      if (mode === 'url') {
        if (!values.inputUrl) {
          throw new Error('请输入视频 URL');
        }
        inputValue = values.inputUrl as string;
        setProgress(25);
      } else {
        const fileList = values.inputFile?.fileList;
        if (!fileList?.length) {
          throw new Error('请上传视频文件');
        }

        const fileItem = fileList[0];
        if (!fileItem.originFileObj) {
          throw new Error('上传文件无效');
        }

        const uploadResponse = await uploadFile(fileItem.originFileObj as File);
        const fileId = uploadResponse?.data?.data?.id;
        setProgress(30);

        if (!fileId) {
          throw new Error(`文件上传失败: ${JSON.stringify(uploadResponse)}`);
        }

        // 本地上传模式：传 file_id 包装
        inputValue = JSON.stringify({ file_id: fileId });
      }

      await runWorkflowStream(
        'video-copy',
        {
          Language: values.Language,
          input: inputValue,
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 8, 95));
          setJsonText((prev) => `${prev}${prev ? '\n' : ''}${JSON.stringify(data, null, 2)}`);

          const parsedOutput = parseOutputFromEvent(data);
          if (parsedOutput) {
            setStreamText((prev) => `${prev}${prev ? '\n' : ''}${parsedOutput}`);
          }
        },
        () => {
          setProgress(100);
          setLoading(false);
          message.success('提取完成');
        },
        (err) => {
          setLoading(false);
          setErrorText(err || '提取失败');
          message.error(err || '提取失败');
        }
      );
    } catch (error) {
      setLoading(false);
      const msg = error instanceof Error ? error.message : '提取失败';
      setErrorText(msg);
      message.error(msg);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            视频提取文案
          </Typography.Title>
          <Typography.Text type="secondary">
            支持视频 URL 或本地上传两种方式
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical" form={form} initialValues={{ Language: '16k_zh-PY' }}>
            <Form.Item
              label="语言选择"
              name="Language"
              rules={[{ required: true, message: '请选择语言' }]}
            >
              <Select options={languageOptions} placeholder="请选择识别语言" />
            </Form.Item>

            <Form.Item label="输入方式">
              <Radio.Group
                value={mode}
                onChange={(e) => setMode(e.target.value as InputMode)}
                options={[
                  { label: '视频 URL', value: 'url' },
                  { label: '本地上传', value: 'upload' },
                ]}
              />
            </Form.Item>

            {mode === 'url' ? (
              <Form.Item
                label="视频 URL"
                name="inputUrl"
                rules={[
                  { required: true, message: '请输入视频 URL' },
                  { type: 'url', message: '请输入合法的 URL' },
                ]}
              >
                <Input placeholder="请输入可访问的视频 URL" />
              </Form.Item>
            ) : (
              <Form.Item label="上传视频" name="inputFile">
                <Upload maxCount={1} beforeUpload={() => false}>
                  <Button icon={<UploadOutlined />}>选择视频文件</Button>
                </Upload>
              </Form.Item>
            )}

            <Button type="primary" loading={loading} onClick={handleSubmit}>
              开始提取
            </Button>
          </Form>
        </Card>

        <ResultPanel
          title="提取结果"
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

export default VideoCopyPage;