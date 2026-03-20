import { Button, Card, Modal, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

type RunItem = {
  id: string;
  module_key: string;
  workflow_id: string;
  input: unknown;
  output: unknown;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  created_at: string;
  finished_at: string | null;
};

const statusColor: Record<RunItem['status'], string> = {
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
};

const RunsPage = () => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RunItem | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const response = await apiFetch<{ success: boolean; data: RunItem[] }>('/api/runs');
      setRuns(response.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const timer = setInterval(fetchRuns, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            我的任务记录
          </Typography.Title>
          <Typography.Text type="secondary">
            仅展示当前登录用户的任务
          </Typography.Text>
        </div>
        <Button onClick={fetchRuns}>刷新</Button>
      </div>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={runs}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '任务ID', dataIndex: 'id', width: 220 },
            { title: '模块', dataIndex: 'module_key', width: 180 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 120,
              render: (status: RunItem['status']) => <Tag color={statusColor[status]}>{status}</Tag>,
            },
            {
              title: '创建时间',
              dataIndex: 'created_at',
              width: 200,
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: '完成时间',
              dataIndex: 'finished_at',
              width: 200,
              render: (value: string | null) => (value ? new Date(value).toLocaleString() : '-'),
            },
            {
              title: '操作',
              width: 120,
              render: (_, record) => (
                <Button type="link" onClick={() => setSelected(record)}>
                  查看
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="任务详情"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={900}
      >
        {selected && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text strong>任务ID：{selected.id}</Typography.Text>
            <Typography.Text>模块：{selected.module_key}</Typography.Text>
            <Typography.Text>状态：{selected.status}</Typography.Text>
            <Typography.Title level={5}>输入参数</Typography.Title>
            <pre>{JSON.stringify(selected.input, null, 2)}</pre>
            <Typography.Title level={5}>输出结果</Typography.Title>
            <pre>{JSON.stringify(selected.output, null, 2)}</pre>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default RunsPage;
