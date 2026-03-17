import { Button, Space, Typography } from 'antd';

interface ResultPanelProps {
  title: string;
  streamText: string;
  jsonText?: string;
  onCopyText?: () => void;
  onCopyJson?: () => void;
}

const ResultPanel = ({
  title,
  streamText,
  jsonText,
  onCopyText,
  onCopyJson,
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
      <div className="stream-box">{streamText || '等待输出...'}</div>
    </div>
  );
};

export default ResultPanel;
