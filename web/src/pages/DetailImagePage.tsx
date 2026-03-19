import { Button, Card, Form, Input, Select, Space, Tabs, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, uploadFile } from '../lib/api';

const DetailImagePage = () => {
  const [branch, setBranch] = useState<'withRef' | 'noRef'>('withRef');
  const [streamText, setStreamText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const workflowOptions = useMemo(
    () => [
      {
        key: 'withRef',
        label: '有参考图版本',
        workflowId: '7616669788698361897',
      },
      {
        key: 'noRef',
        label: '无参考图版本',
        workflowId: '7615500483961585691',
      },
    ],
    []
  );

  const activeWorkflow = workflowOptions.find((item) => item.key === branch);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setStreamText('');
    setJsonText('');
    setLoading(true);

    try {
      let mainImage = values.img1Url as string | undefined;
      if (!mainImage && values.img1?.file) {
        const uploadResponse = await uploadFile(values.img1.file as File);
        mainImage = uploadResponse?.data?.file_id ?? uploadResponse?.file_id;
      }

      let refImages: string[] | undefined;
      if (branch === 'withRef') {
        refImages = [];
        if (values.img2?.fileList?.length) {
          for (const fileItem of values.img2.fileList) {
            if (fileItem.originFileObj) {
              const uploadResponse = await uploadFile(fileItem.originFileObj as File);
              const fileId = uploadResponse?.data?.file_id ?? uploadResponse?.file_id;
              if (fileId) {
                refImages.push(fileId);
              }
            }
          }
        }
        if (values.img2Urls) {
          const urlList = values.img2Urls
            .split('\n')
            .map((item: string) => item.trim())
            .filter(Boolean);
          refImages.push(...urlList);
        }
      }

      const parameters: Record<string, unknown> =
        branch === 'withRef'
          ? {
              img1: mainImage,
              img2: refImages && refImages.length > 0 ? refImages : undefined,
              maidian: values.maidian,
              name: values.name,
              aspectRatio: values.aspectRatio,
            }
          : {
              img: mainImage,
              maidian: values.maidian,
              name: values.name,
              aspectRatio: values.aspectRatio,
            };

      await runWorkflowStream(
        branch === 'withRef' ? 'detail-image-with-ref' : 'detail-image-no-ref',
        parameters,
        (data) => {
          setJsonText((prev) => `${prev}\n${JSON.stringify(data, null, 2)}`);
          if (typeof data === 'string') {
            setStreamText((prev) => `${prev}${data}`);
          }
        },
        () => {
          setLoading(false);
          message.success('生成完成');
        },
        (err) => {
          setLoading(false);
          message.error(err || '生成失败');
        }
      );
    } catch (error) {
      setLoading(false);
      message.error(error instanceof Error ? error.message : '生成失败');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            详情图生成
          </Typography.Title>
          <Typography.Text type="secondary">
            输入产品信息与图片，生成详情图或文案组合
          </Typography.Text>
        </div>
      </div>
      <Tabs
        activeKey={branch}
        onChange={(key) => setBranch(key as 'withRef' | 'noRef')}
        items={workflowOptions.map((option) => ({
          key: option.key,
          label: option.label,
        }))}
      />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical" form={form}>
            <Form.Item label="Workflow ID">
              <Input value={activeWorkflow?.workflowId} disabled />
            </Form.Item>
            <Form.Item label="画幅比例" name="aspectRatio">
              <Select
                options={['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'].map((value) => ({
                  value,
                  label: value,
                }))}
                placeholder="请选择画幅比例"
              />
            </Form.Item>
            <Form.Item label="主图" name="img1">
              <Upload maxCount={1} beforeUpload={() => false}>
                <Button icon={<UploadOutlined />}>上传主图</Button>
              </Upload>
            </Form.Item>
            <Form.Item label="主图 URL" name="img1Url">
              <Input placeholder="输入图片 URL" />
            </Form.Item>
            {branch === 'withRef' && (
              <>
                <Form.Item label="参考图" name="img2">
                  <Upload multiple beforeUpload={() => false}>
                    <Button icon={<UploadOutlined />}>上传参考图</Button>
                  </Upload>
                </Form.Item>
                <Form.Item label="参考图 URL" name="img2Urls">
                  <Input.TextArea
                    placeholder="输入图片 URL 列表，每行一个"
                    rows={4}
                  />
                </Form.Item>
              </>
            )}
            <Form.Item label="卖点文案" name="maidian">
              <Input.TextArea rows={6} placeholder="请输入卖点文案" />
            </Form.Item>
            <Form.Item label="产品名称" name="name">
              <Input placeholder="请输入产品名称" />
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
          onCopyText={() => navigator.clipboard.writeText(streamText)}
          onCopyJson={() => navigator.clipboard.writeText(jsonText)}
        />
      </Space>
    </div>
  );
};

export default DetailImagePage;
