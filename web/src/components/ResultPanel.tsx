import { Alert, Button, Card, Progress, Space, Typography, Tag } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

interface ResultPanelProps {
  title: string;
  streamText: string;
  jsonText?: string;
  onCopyText?: () => void;
  onCopyJson?: () => void;
  loading?: boolean;
  progress?: number;
  errorText?: string;
  type?: 'primary' | 'success' | 'warning';
}

const ResultPanel = ({
  title,
  streamText,
  jsonText,
  onCopyText,
  onCopyJson,
  loading,
  progress,
  errorText,
  type = 'primary',
}: ResultPanelProps) => {
  const tagColors = {
    primary: 'blue',
    success: 'green',
    warning: 'orange',
  };

  return (
    <Card
      className="result-panel"
      title={
        <Space>
          <Tag color={tagColors[type]}>{title}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<CopyOutlined />} onClick={onCopyText}>
            复制
          </Button>
          {jsonText && (
            <Button size="small" icon={<CopyOutlined />} onClick={onCopyJson}>
              JSON
            </Button>
          )}
        </Space>
      }
    >
      {typeof progress === 'number' && <Progress percent={progress} size="small" />}
      {loading && <Typography.Text type="secondary">任务运行中...</Typography.Text>}
      {errorText && <Alert type="error" message={errorText} showIcon style={{ marginBottom: 8 }} />}
      <div style={{ 
        background: '#f6f8fa', 
        padding: 16, 
        borderRadius: 8, 
        minHeight: 80,
        maxHeight: 300,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: 14,
        lineHeight: 1.6,
        color: '#333'
      }}>
        {streamText || <Typography.Text type="secondary">等待输出...</Typography.Text>}
      </div>
    </Card>
  );
};

export default ResultPanel;
