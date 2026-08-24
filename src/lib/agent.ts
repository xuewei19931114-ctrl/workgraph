import type { CandidateModel } from '../types'

interface ReplyContext {
  model: CandidateModel | null
  conversations: number
  turn: number
}

/**
 * 演示用的职业智能体：真实产品里这里是一次模型调用。
 * 这份实现按关键词挑选追问方向，保证回复始终落在"追问 + 说明依据"的结构上。
 */
export function draftReply(input: string, context: ReplyContext): string {
  const text = input.trim()
  const basis = context.model
    ? `我参考了你画像里的「${context.model.headline}」和 ${context.model.sourceLabel}。`
    : `你还没有导入聊天记录，所以我现在只能基于这次对话判断，结论会比较粗。`

  for (const rule of rules) {
    if (rule.match.test(text)) {
      return `${rule.observation}\n\n${basis}\n\n${rule.question}`
    }
  }

  const fallback = fallbacks[context.turn % fallbacks.length]
  return `${fallback.observation}\n\n${basis}\n\n${fallback.question}`
}

/** 从首条用户消息里取一个短标题，用于历史对话列表。 */
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return '未命名对话'
  return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean
}

const rules = [
  {
    match: /(不知道|迷茫|没想好|不清楚|适合什么)/,
    observation:
      '"不知道自己适合什么"通常不是信息不够，而是判断标准还没定下来。与其先列岗位，不如先找出哪些工作状态曾经让你愿意主动加班——那才是真正的偏好证据。',
    question: '想先问你一个具体的：最近半年里，有没有哪件工作让你做完之后觉得"这个我还想再做一次"？',
  },
  {
    match: /(创业|早期|初创|种子|天使|0到1|0→1)/,
    observation:
      '早期团队真正稀缺的不是能力全面的人，而是能在没人定义问题时先把问题定义出来的人。你在对话里反复表现出的正是这一点。',
    question: '不过早期团队也意味着角色边界频繁变化。你更在意的是"能自己决定做什么"，还是"能看到确定的成长路径"？',
  },
  {
    match: /(转行|换行业|跨行|转型)/,
    observation:
      '转行的成本主要不在技能，而在你要重新证明自己的判断力。可迁移的通常是你处理问题的方式，而不是行业知识。',
    question: '你想转的方向里，有哪一部分是你已经在业余时间做过、并且拿到过真实反馈的？',
  },
  {
    match: /(简历|面试|投递|求职|找工作)/,
    observation:
      '简历擅长描述你待过哪里，不擅长描述你怎么做判断。而后者恰恰是早期团队最想知道的。你的聊天记录里其实已经有大量这类证据。',
    question: '如果只能用一个你亲手推动的决定来代表你，你会选哪一个？当时的信息有多不完整？',
  },
  {
    match: /(薪资|工资|待遇|涨薪|offer)/,
    observation:
      '薪资谈判的空间几乎完全取决于对方是否相信你能独立承担某类问题。所以我们最好先把"你能独立扛住什么"说清楚。',
    question: '在你过去的工作里，有哪件事是别人做不了、只能你来做的？',
  },
  {
    match: /(累|倦怠|内耗|压力|焦虑|不想干)/,
    observation:
      '消耗感往往不来自工作量，而来自你无法影响结果却仍要为结果负责。区分这两者，比换一份工作更能解决问题。',
    question: '最近让你消耗最大的那件事，是因为太难，还是因为你觉得它本来就不该这么做？',
  },
  {
    match: /(管理|带团队|带人|leader|晋升)/,
    observation:
      '从做事切换到带人，最大的变化是你的产出开始依赖别人的判断质量。这需要的不是更强的执行力，而是更强的标准表达能力。',
    question: '你有没有向别人解释过"这件事为什么必须这么做"，并且对方真的照做了？那次是怎么发生的？',
  },
]

const fallbacks = [
  {
    observation:
      '我先把你说的记下来了。为了不做过度推断，我想再要一个具体场景，而不是一个概括性的判断。',
    question: '能举一个最近发生的例子吗？当时你面对的信息有多少，最后是怎么决定的？',
  },
  {
    observation:
      '这一条我会先标成待验证。单次描述还不足以支撑一个稳定的特质判断，我需要看到它在不同场景里重复出现。',
    question: '换一个完全不同的项目，你会用同样的方式处理吗？还是会明显不一样？',
  },
  {
    observation:
      '你描述的方式里有一个值得注意的点：你更关注问题本身是否成立，而不是任务是否完成。这在早期团队里是优势，在成熟流程里可能会被视为越界。',
    question: '你更愿意待在哪一种环境里？还是说你其实两种都待过，感受不同？',
  },
]
