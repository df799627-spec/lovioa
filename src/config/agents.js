import {
  Clapperboard,
  Sparkles,
} from 'lucide-react';

export const CREATIVE_AGENT = {
  value: 'creative-agent',
  label: '创作 Agent',
  description: '读取工作区内容，整理分镜和待生成提示词，不直接提交生成任务',
  icon: Sparkles,
  tools: ['读工作区', '读图片', '读分镜', '整理分镜提示词'],
};

export const DEFAULT_AGENT_ID = CREATIVE_AGENT.value;

export const AGENT_TOOL_ICONS = {
  整理分镜提示词: Clapperboard,
};
