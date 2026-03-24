export const modules = {
  'detail-image-with-ref': {
    key: 'detail-image-with-ref',
    name: '详情图生成（有参考图）',
    workflowId: '7616669788698361897',
  },
  'detail-image-no-ref': {
    key: 'detail-image-no-ref',
    name: '详情图生成（无参考图）',
    workflowId: '7615500483961585691',
  },
  'video-copy': {
    key: 'video-copy',
    name: '提取视频文案',
    workflowId: '7569800959866617871',
  },
  'product-copy': {
    key: 'product-copy',
    name: '产品文案生成',
    workflowId: '7543166210068185138',
  },
} as const;

export type ModuleKey = keyof typeof modules;