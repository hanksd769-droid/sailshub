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
        maxHeight: 400,
        overflow: 'auto',
        fontSize: 14,
        lineHeight: 1.8,
        color: '#333'
      }}>
        {streamText ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              try {
                // 尝试解析为 JSON
                const jsonData = JSON.parse(streamText);
                if (typeof jsonData === 'object' && jsonData !== null) {
                  return Object.entries(jsonData).map(([key, value], index) => (
                    <div key={index} style={{ 
                      background: '#fff', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      borderLeft: '3px solid #1890ff'
                    }}>
                      <Typography.Text strong style={{ color: '#1890ff' }}>{key}:</Typography.Text>
                      <Typography.Text style={{ marginLeft: 8 }}>
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </Typography.Text>
                    </div>
                  ));
                }
              } catch {
                // 不是 JSON，按原样显示
              }
              // 非 JSON 文本，按行分割显示
              return streamText.split('\n').map((line, index) => {
                const trimmed = line.trim();
                if (!trimmed) return null;
                return (
                  <div key={index} style={{ 
                    background: '#fff', 
                    padding: '8px 12px', 
                    borderRadius: 4,
                    borderLeft: '3px solid #1890ff'
                  }}>
                    {trimmed}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <Typography.Text type="secondary">等待输出...</Typography.Text>
        )}
      </div>
    </Card>
  );
};

export default ResultPanel;
