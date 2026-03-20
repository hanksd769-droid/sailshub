import { Alert, Button, Progress, Space, Typography } from 'antd';

interface ResultPanelProps {
  title: string;
  streamText: string;
  jsonText?: string;
  onCopyText?: () => void;
  onCopyJson?: () => void;
  loading?: boolean;
  progress?: number;
  errorText?: string;
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
}: ResultPanelProps) => {
  return (
    <div className="result-panel">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Space className="result-actions">
          <Button onClick={onCopyText}>复制文本</Button>
          <Button onClick={onCopyJson} disabled={!jsonText}>
            复制 JSON
          </Button>
        </Space>
      </div>
      {typeof progress === 'number' && <Progress percent={progress} size="small" />}
      {loading && <Typography.Text type="secondary">任务运行中...</Typography.Text>}
      {errorText && <Alert type="error" message={errorText} showIcon />}
      <div className="stream-box">{streamText || '等待输出...'}</div>
    </div>
  );
};

export default ResultPanel;
