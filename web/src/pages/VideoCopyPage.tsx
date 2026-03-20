import { Button, Card, Form, Space, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, uploadFile } from '../lib/api';

const VideoCopyPage = () => {
  const [streamText, setStreamText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!values.input?.fileList?.length) {
      message.error('请上传视频');
      return;
    }

    setStreamText('');
    setJsonText('');
    setErrorText('');
    setProgress(5);
    setLoading(true);

    try {
      const fileItem = values.input.fileList[0];
      if (!fileItem.originFileObj) {
        message.error('上传文件无效');
        setLoading(false);
        return;
      }

      const uploadResponse = await uploadFile(fileItem.originFileObj as File);
      console.log('uploadResponse:', uploadResponse);
      const fileId = uploadResponse?.data?.data?.id;
      setProgress(30);

      if (!fileId) {
        throw new Error(`文件上传失败: ${JSON.stringify(uploadResponse)}`);
      }

      await runWorkflowStream(
        'video-copy',
        {
          input: [JSON.stringify({ file_id: fileId })],
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 5, 95));
          setJsonText((prev) => `${prev}\n${JSON.stringify(data, null, 2)}`);
          if (typeof data === 'string') {
            setStreamText((prev) => `${prev}${data}`);
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
            上传视频后自动提取文案
          </Typography.Text>
        </div>
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical" form={form}>
            <Form.Item label="上传视频" name="input">
              <Upload maxCount={1} beforeUpload={() => false}>
                <Button icon={<UploadOutlined />}>选择视频文件</Button>
              </Upload>
            </Form.Item>
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
