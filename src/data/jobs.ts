import type { Job } from '../types'

export const dailyJobs: Job[] = [
  {
    id: 'moonsoil',
    company: '月壤 AI',
    badge: '月',
    role: 'AI 产品经理',
    meta: '上海 · A 轮 · 20–50 人',
    match: 92,
    reason: '岗位需要从模糊需求快速做出可验证原型，与你反复呈现的工作方式高度一致。',
    evidence: ['0→1 产品探索', '用户访谈', '快速原型'],
    verify: '需要确认：你是否愿意承担早期团队较高的不确定性？',
  },
  {
    id: 'floating-island',
    company: '浮岛社区',
    badge: '浮',
    role: '社区产品负责人',
    meta: '北京 / 远程 · 种子轮',
    match: 87,
    reason: '团队正在解决高质量陌生人连接问题，与你持续关注的社交匹配主题直接相关。',
    evidence: ['社区机制', '用户洞察', '冷启动'],
    verify: '需要确认：你更喜欢产品设计还是亲自运营社区？',
  },
  {
    id: 'sequence',
    company: '序列科技',
    badge: '序',
    role: '创始人办公室 · 产品方向',
    meta: '杭州 · Pre-A · 10–20 人',
    match: 84,
    reason: '这个角色需要在产品、研究和增长之间切换，适合问题导向而非职能导向的人。',
    evidence: ['跨职能', '决策判断', '快速学习'],
    verify: '需要确认：你是否接受角色边界在早期频繁变化？',
  },
]
