import { Button, Card, List, Modal, Form, Input, Space, Typography, message, Tag, Popconfirm } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCopyLibrary,
  deleteCopyLibraryItem,
  createCopyLibraryItem,
  type CopyLibraryItem,
} from '../lib/api';

const CopyLibraryPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<CopyLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await getCopyLibrary();
      if (res.success) {
        setItems(res.data);
      }
    } catch (error) {
      message.error('获取文案库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await deleteCopyLibraryItem(id);
      message.success('删除成功');
      fetchItems();
    } catch {
      message.error('删除失败');
    }
  };

  const handleCreate = async (values: { name: string }) => {
    try {
      await createCopyLibraryItem({
        name: values.name,
        buwei: [],
        changping: '',
        donzuojiexi: [],
      });
      message.success('创建成功');
      setIsModalOpen(false);
      form.resetFields();
      fetchItems();
    } catch {
      message.error('创建失败');
    }
  };

  const handleUseForMixCut = (item: CopyLibraryItem) => {
    navigate('/modules/mix-cut', { state: { copyData: item } });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            文案库
          </Typography.Title>
          <Typography.Text type="secondary">
            管理生成的文案、翻译和语音，方便混剪调用
          </Typography.Text>
        </div>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          新建文案
        </Button>
      </div>

      <List
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 3 }}
        loading={loading}
        dataSource={items}
        renderItem={(item) => (
          <List.Item>
            <Card
              title={item.name}
              extra={
                <Space>
                  <Button type="link" onClick={() => handleUseForMixCut(item)}>
                    用于混剪
                  </Button>
                  <Popconfirm
                    title="确认删除"
                    description="删除后无法恢复，是否继续？"
                    onConfirm={() => item.id && handleDelete(item.id)}
                  >
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                {item.changping && (
                  <div>
                    <Typography.Text type="secondary">产品：</Typography.Text>
                    <Typography.Text>{item.changping}</Typography.Text>
                  </div>
                )}
                {item.buwei && item.buwei.length > 0 && (
                  <div>
                    <Typography.Text type="secondary">部位：</Typography.Text>
                    <Tag color="blue">{item.buwei.length} 个</Tag>
                  </div>
                )}
                {item.donzuojiexi && item.donzuojiexi.length > 0 && (
                  <div>
                    <Typography.Text type="secondary">动作解析：</Typography.Text>
                    <Tag color="green">{item.donzuojiexi.length} 个</Tag>
                  </div>
                )}
                {item.translated_lines && item.translated_lines.length > 0 && (
                  <div>
                    <Typography.Text type="secondary">翻译：</Typography.Text>
                    <Tag color="orange">{item.translated_lines.length} 条</Tag>
                  </div>
                )}
                {item.tts_individual && item.tts_individual.length > 0 && (
                  <div>
                    <Typography.Text type="secondary">语音：</Typography.Text>
                    <Tag color="purple">{item.tts_individual.length} 条</Tag>
                  </div>
                )}
                {item.created_at && (
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      创建时间：{new Date(item.created_at).toLocaleString()}
                    </Typography.Text>
                  </div>
                )}
              </Space>
            </Card>
          </List.Item>
        )}
      />

      <Modal
        title="新建文案"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
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
                创建
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CopyLibraryPage;
