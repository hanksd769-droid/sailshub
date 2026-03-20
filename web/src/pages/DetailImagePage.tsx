import { Button, Card, Form, Input, Select, Space, Tabs, Typography, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import ResultPanel from '../components/ResultPanel';
import { runWorkflowStream, uploadFile } from '../lib/api';

type StreamEvent = {
  event?: string;
  data?: {
    content?: string;
  };
};

const DetailImagePage = () => {
  const [branch, setBranch] = useState<'withRef' | 'noRef'>('withRef');
  const [streamText, setStreamText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState('');
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

  const isUrl = (value: string) => /^https?:\/\//i.test(value);

  const toWorkflowImageParam = (value: string) => {
    // URL 直接传；本地上传后得到的是 file_id，需包成 {"file_id":"..."} 字符串
    return isUrl(value) ? value : JSON.stringify({ file_id: value });
  };

  const extractLinksFromEvent = (data: unknown) => {
    const links: string[] = [];

    if (typeof data === 'string') return links;

    const eventObj = data as StreamEvent;
    if (eventObj.event === 'Message' && eventObj.data?.content) {
      try {
        const parsedContent = JSON.parse(eventObj.data.content) as {
          output?: Array<{ output?: string[] }>;
        };
        const parsedLinks = (parsedContent.output || [])
          .flatMap((item) => item.output || [])
          .filter((item) => typeof item === 'string');
        links.push(...parsedLinks);
      } catch {
        // ignore
      }
    }

    return links;
  };

  const runSingleWorkflow = (parameters: Record<string, unknown>) =>
    new Promise<{ stream: string; json: string; links: string[]; error?: string }>((resolve) => {
      let localStream = '';
      let localJson = '';
      let localLinks: string[] = [];

      runWorkflowStream(
        'detail-image-with-ref',
        parameters,
        (data) => {
          localJson += `${localJson ? '\n' : ''}${JSON.stringify(data, null, 2)}`;

          if (typeof data === 'string') {
            localStream += data;
            return;
          }

          const links = extractLinksFromEvent(data);
          if (links.length > 0) {
            localLinks = Array.from(new Set([...localLinks, ...links]));
            localStream += `${localStream ? '\n' : ''}${links.join('\n')}`;
          } else {
            const eventObj = data as StreamEvent;
            if (eventObj?.data?.content) {
              localStream += `${localStream ? '\n' : ''}${eventObj.data.content}`;
            }
          }
        },
        () => resolve({ stream: localStream, json: localJson, links: localLinks }),
        (err) => resolve({ stream: localStream, json: localJson, links: localLinks, error: err || '生成失败' })
      );
    });

  const handleSubmit = async () => {
    const values = await form.validateFields();

    setStreamText('');
    setJsonText('');
    setImageUrls([]);
    setErrorText('');
    setProgress(5);
    setLoading(true);

    try {
      // 1) 主图
      let mainImage = values.img1Url as string | undefined;
      if (!mainImage && values.img1?.file) {
        const uploadResponse = await uploadFile(values.img1.file as File);
        mainImage = uploadResponse?.data?.data?.id;
      }

      if (!mainImage) {
        throw new Error('主图参数缺失，请上传主图或填写主图URL');
      }

      const mainImageParam = toWorkflowImageParam(mainImage);
      setProgress(20);

      // 2) 有参考图：每次仅传入 1 张 img2，并发调用
      if (branch === 'withRef') {
        let refImages: string[] = [];

        if (values.img2?.fileList?.length) {
          for (const fileItem of values.img2.fileList) {
            if (fileItem.originFileObj) {
              const uploadResponse = await uploadFile(fileItem.originFileObj as File);
              const fileId = uploadResponse?.data?.data?.id;
              if (fileId) refImages.push(fileId);
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

        // 如果没提供参考图，则仍执行一次（img2 为空）
        if (refImages.length === 0) {
          refImages = [''];
        }

        const total = refImages.length;
        let doneCount = 0;

        const jobs = refImages.map((ref) => {
          const params: Record<string, unknown> = {
            aspectRatio: values.aspectRatio,
            img1: mainImageParam,
            img2: ref ? toWorkflowImageParam(ref) : '',
            maidian: values.maidian,
            name: values.name,
          };

          return runSingleWorkflow(params).then((result) => {
            doneCount += 1;
            const percent = 20 + Math.floor((doneCount / total) * 80);
            setProgress(Math.min(percent, 99));
            return result;
          });
        });

        const results = await Promise.all(jobs);

        const allLinks = Array.from(new Set(results.flatMap((r) => r.links)));
        const allStream = results
          .map((r, idx) => `--- 任务 ${idx + 1} ---\n${r.stream || '(无文本输出)'}`)
          .join('\n\n');
        const allJson = results
          .map((r, idx) => `--- 任务 ${idx + 1} ---\n${r.json || '(无JSON输出)'}`)
          .join('\n\n');

        const errors = results.filter((r) => r.error).map((r) => r.error as string);

        setImageUrls(allLinks);
        setStreamText(allStream);
        setJsonText(allJson);

        if (errors.length > 0) {
          setErrorText(`部分任务失败：${errors.join(' | ')}`);
          message.warning('部分参考图生成失败，请查看结果区错误信息');
        } else {
          setErrorText('');
          message.success('全部参考图生成完成');
        }

        setProgress(100);
        setLoading(false);
        return;
      }

      // 3) 无参考图：单次调用
      await runWorkflowStream(
        'detail-image-no-ref',
        {
          img: mainImageParam,
          maidian: values.maidian,
          name: values.name,
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 5, 95));
          setJsonText((prev) => `${prev}${prev ? '\n' : ''}${JSON.stringify(data, null, 2)}`);

          if (typeof data === 'string') {
            setStreamText((prev) => `${prev}${data}`);
            return;
          }

          const links = extractLinksFromEvent(data);
          if (links.length > 0) {
            setImageUrls((prev) => Array.from(new Set([...prev, ...links])));
            setStreamText((prev) => `${prev}${prev ? '\n' : ''}${links.join('\n')}`);
          } else {
            const eventObj = data as StreamEvent;
            if (eventObj?.data?.content) {
              setStreamText((prev) => `${prev}${prev ? '\n' : ''}${eventObj.data?.content}`);
            }
          }
        },
        () => {
          setProgress(100);
          setLoading(false);
          message.success('生成完成');
        },
        (err) => {
          setLoading(false);
          setErrorText(err || '生成失败');
          message.error(err || '生成失败');
        }
      );
    } catch (error) {
      setLoading(false);
      const msg = error instanceof Error ? error.message : '生成失败';
      setErrorText(msg);
      message.error(msg);
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
                  <Input.TextArea placeholder="输入图片 URL 列表，每行一个" rows={4} />
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
          loading={loading}
          progress={progress}
          errorText={errorText}
          imageUrls={imageUrls}
          onCopyText={() => navigator.clipboard.writeText(streamText)}
          onCopyJson={() => navigator.clipboard.writeText(jsonText)}
        />
      </Space>
    </div>
  );
};

export default DetailImagePage;