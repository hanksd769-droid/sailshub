const normalizeTranslatedText = (raw: string): string => {
  const text = raw.trim();

  // 可能是 {"output":"..."} 或 {"result":"..."} 这种字符串
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const picked = pickTextFromUnknown(obj);
      if (picked) return picked;
    } catch {
      // ignore
    }
  }

  // 可能是 ["..."] 或 ["a","b"]
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const arr = JSON.parse(text) as unknown[];
      if (arr.length === 1 && typeof arr[0] === 'string') return arr[0].trim();
      return arr.map((x) => String(x)).join(' ').trim();
    } catch {
      // ignore
    }
  }

  return text;
};

const translateLinesToEnglish = async (lines: string[]) => {
  const moduleInfo = modules.translation;
  if (!moduleInfo) {
    throw new Error('翻译模块未配置，请先在 modules.ts 增加 translation');
  }

  const translatedLines: string[] = [];

  for (const line of lines) {
    const stream = await cozeClient.workflows.runs.stream({
      workflow_id: moduleInfo.workflowId,
      parameters: {
        erchuan_wenan: line,
        language: 'english',
      },
    });

    let translated = '';

    for await (const chunk of stream) {
      const c = chunk as Record<string, unknown>;
      const direct = pickTextFromUnknown(c.data) || pickTextFromUnknown(c);
      if (direct) translated = direct;

      const content = (c.data as Record<string, unknown> | undefined)?.content;
      if (!translated && typeof content === 'string' && content.trim()) {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          translated = pickTextFromUnknown(parsed) || content.trim();
        } catch {
          translated = content.trim();
        }
      }
    }

    translatedLines.push(normalizeTranslatedText(translated || line));
  }

  return translatedLines;
};