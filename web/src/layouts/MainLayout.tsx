import { Button, Card, Modal, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
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

const preStyle = {
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
  overflow: 'auto' as const,
  background: '#fafafa',
  border: '1px solid #f0f0f0',
  borderRadius: 8,
  padding: 12,
  margin: 0,
};

const urlRegex = /https?:\/\/[^\s"']+/g;

const extractDebugLinks = (value: unknown): string[] => {
  const links = new Set<string>();

  const walk = (node: unknown) => {
    if (!node) return;

    if (typeof node === 'string') {
      // 1) 字符串里提取 URL
      const matches = node.match(urlRegex) || [];
      matches.forEach((u) => {
        if (u.toLowerCase().includes('debug') || u.toLowerCase().includes('trace') || u.toLowerCase().includes('log')) {
          links.add(u);
        }
      });

      // 2) 若字符串本身是 JSON，再递归
      try {
        const parsed = JSON.parse(node);
        walk(parsed);
      } catch {
        // ignore
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node === 'object') {
      const record = node as Record<string, unknown>;
      Object.entries(record).forEach(([k, v]) => {
        const key = k.toLowerCase();
        if (
          (key.includes('debug') || key.includes('trace') || key.includes('log')) &&
          typeof v === 'string' &&
          /^https?:\/\//i.test(v)
        ) {
          links.add(v);
        }
        walk(v);
      });
    }
  };

  walk(value);
  return Array.from(links);
};

const RunsPage = () => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RunItem | null>(null);

  const debugLinks = useMemo(
    () => (selected ? extractDebugLinks(selected.output) : []),
    [selected]
  );

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
          <Typography.Text type="secondary">仅展示当前登录用户的任务</Typography.Text>
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
            { title: '任务ID', dataIndex: 'id', width: 280 },
            { title: '模块', dataIndex: 'module_key', width: 200 },
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

      <Modal title="任务详情" open={!!selected} onCancel={() => setSelected(null)} footer={null} width={980}>
        {selected && (
          <Space direction="vertical" style={{ width: '100%' }} size={14}>
            <Typography.Text strong>任务ID：{selected.id}</Typography.Text>
            <Typography.Text>模块：{selected.module_key}</Typography.Text>
            <Typography.Text>状态：{selected.status}</Typography.Text>

            <Typography.Title level={5} style={{ margin: 0 }}>
              输入参数
            </Typography.Title>
            <pre style={{ ...preStyle, maxHeight: 260 }}>
              {JSON.stringify(selected.input, null, 2)}
            </pre>

            <Typography.Title level={5} style={{ margin: 0 }}>
              调试链接
            </Typography.Title>
            {debugLinks.length > 0 ? (
              <Space direction="vertical" size={6}>
                {debugLinks.map((link) => (
                  <a key={link} href={link} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">未检测到调试链接</Typography.Text>
            )}

            <Typography.Title level={5} style={{ margin: 0 }}>
              输出结果
            </Typography.Title>
            <pre style={{ ...preStyle, maxHeight: 360 }}>
              {JSON.stringify(selected.output, null, 2)}
            </pre>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default RunsPage;