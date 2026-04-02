import { Button, Card, Form, Input, Space, Typography, message, List, Tag, Divider } from 'antd';
import { useState } from 'react';
import { runWorkflowStream } from '../lib/api';

const MixCutPage = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    output?: string;
    json?: string;
  } | null>(null);

  const [form] = Form.useForm();

  const handleSubmit = async () => {
    const values = await form.validateFields();

    setLoading(true);
    setProgress(5);
    setResult(null);

    try {
      let outputText = '';
      let jsonText = '';

      await runWorkflowStream(
        'product-copy-v2',
        {
          buwei: values.buwei ? values.buwei.split('\n').filter((s: string) => s.trim()) : [],
          changping: values.changping || '',
          donzuojiexi: values.donzuojiexi ? values.donzuojiexi.split('\n').filter((s: string) => s.trim()) : [],
          koubo_mp3_Array: values.koubo_mp3_Array ? values.koubo_mp3_Array.split('\n').filter((s: string) => s.trim()) : [],
          koubo_mp3_hebin: values.koubo_mp3_hebin || '',
        },
        (data) => {
          setProgress((prev) => Math.min(prev + 10, 95));
          jsonText += (jsonText ? '\n' : '') + JSON.stringify(data, null, 2);

          if (typeof data === 'string') {
            outputText += (outputText ? '\n' : '') + data;
          } else if (typeof data === 'object' && data !== null) {
            const eventObj = data as { event?: string; data?: { content?: string } };
            if (eventObj.event === 'Message' && eventObj.data?.content) {
              outputText += (outputText ? '\n' : '') + eventObj.data.content;
            }
          }
        },
        () => {
          setProgress(100);
          setLoading(false);
          setResult({ output: outputText, json: jsonText });
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

  // 解析输出中的JSON链接
  const parseOutput = (output: string) => {
    try {
      const parsed = JSON.parse(output);
      return parsed;
    } catch {
      return null;
    }
  };

  const parsedResult = result?.output ? parseOutput(result.output) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            混剪功能
          </Typography.Title>
          <Typography.Text type="secondary">
            输入所有参数，调用 Coze 工作流生成混剪结果
          </Typography.Text>
        </div>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card className="form-section">
          <Form layout="vertical" form={form}>
            <Form.Item
              label="部位 (buwei)"
              name="buwei"
              rules={[{ required: true, message: '请输入部位，每行一个' }]}
              help="每行一个部位，例如：脸、产品"
            >
              <Input.TextArea rows={4} placeholder="脸\n产品\n脸\n产品" />
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
              rules={[{ required: true, message: '请输入动作解析，每行一个' }]}
              help="每行一个动作解析"
            >
              <Input.TextArea rows={4} placeholder="使用前+使用后效果\n介绍产品\n使用中效果\n引导购买效果" />
            </Form.Item>

            <Form.Item
              label="逐条音频链接 (koubo_mp3_Array)"
              name="koubo_mp3_Array"
              help="每行一个音频链接"
            >
              <Input.TextArea rows={4} placeholder="https://...\nhttps://..." />
            </Form.Item>

            <Form.Item
              label="合并音频链接 (koubo_mp3_hebin)"
              name="koubo_mp3_hebin"
              help="合并后的音频链接"
            >
              <Input placeholder="https://..." />
            </Form.Item>

            <Button type="primary" loading={loading} onClick={handleSubmit}>
              开始生成
            </Button>
          </Form>
        </Card>

        {/* 结果显示区域 */}
        {result && (
          <Card title="生成结果" className="form-section">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {parsedResult ? (
                <div style={{ background: '#f6f8fa', padding: 16, borderRadius: 8 }}>
                  <Typography.Title level={5}>混剪输出</Typography.Title>
                  
                  {/* 显示各个字段 */}
                  {Object.entries(parsedResult).map(([key, value]) => (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <Tag color="blue">{key}</Tag>
                      <div style={{ 
                        background: '#fff', 
                        padding: 12, 
                        borderRadius: 4, 
                        marginTop: 8,
                        wordBreak: 'break-all'
                      }}>
                        {Array.isArray(value) ? (
                          <List
                            size="small"
                            dataSource={value}
                            renderItem={(item, index) => (
                              <List.Item>
                                <Typography.Text code>{index + 1}. {String(item)}</Typography.Text>
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Typography.Text>{String(value)}</Typography.Text>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: '#f6f8fa', padding: 16, borderRadius: 8 }}>
                  <Typography.Text>{result.output}</Typography.Text>
                </div>
              )}

              {/* 原始JSON */}
              <Divider />
              <Typography.Title level={5}>原始响应</Typography.Title>
              <div style={{ 
                background: '#f6f8fa', 
                padding: 16, 
                borderRadius: 8,
                maxHeight: 300,
                overflow: 'auto'
              }}>
                <pre style={{ margin: 0, fontSize: 12 }}>{result.json}</pre>
              </div>
            </Space>
          </Card>
        )}
      </Space>
    </div>
  );
};

export default MixCutPage;
