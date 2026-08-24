import type { ArchiveStats, CandidateModel, CareerProfile } from '../types'

/**
 * 演示版的画像生成：真实产品里这一步由 AI 完成，这里用固定的报告骨架
 * 配合真实解析出来的对话量，保证界面里的数字和用户导入的文件一致。
 */
export function buildCandidateModel(stats: ArchiveStats, fileCount: number): CandidateModel {
  return {
    generatedAt: Date.now(),
    headline: '问题导向的早期产品建造者',
    thesis:
      '如果完全不看简历，这些对话呈现的是一个习惯把模糊问题拆成可验证假设的人：先自己定义问题边界，再快速做出最小可用的东西去撞真实反馈，而不是等需求被别人整理好。他对"人和人如何被匹配"这类机制性问题有持续兴趣，并且在被反驳时会主动修改结论而不是维护原方案。',
    dimensionCount: 12,
    sourceLabel: `${fileCount} 份文件 · ${stats.conversations} 段对话`,
    unknownCount: 4,
    dimensions: [
      {
        label: '问题定义方式',
        confidence: 'high',
        detail:
          '反复出现先追问"这个问题真正卡在哪"再谈方案的模式，跨越至少 6 段互不相关的对话，且在不同主题下保持一致。',
      },
      {
        label: '面对反驳的反应',
        confidence: 'high',
        detail:
          '当结论被挑战时，倾向于补充反例并重写判断，而不是补充论据维护原结论。这类修正在记录中可以逐条追溯。',
      },
      {
        label: '交付节奏',
        confidence: 'medium',
        detail:
          '多次出现"先做一个粗糙版本再说"的表达，但记录里能看到的完成结果有限，暂时无法判断长周期项目的收尾能力。',
      },
      {
        label: '协作与影响他人',
        confidence: 'medium',
        detail:
          '提到过说服同事和对齐目标的场景，但描述较少，无法确认是主导推动还是配合执行。',
      },
      {
        label: '量化与数据能力',
        confidence: 'unknown',
        detail: '对话中几乎没有涉及指标设计、实验分析或数据口径的讨论，保留为 Unknown。',
      },
      {
        label: '管理与带人经验',
        confidence: 'unknown',
        detail: '没有出现关于团队搭建、绩效沟通或招聘的内容，不做推断。',
      },
    ],
    cannotProve: [
      '在大规模成熟组织中的协作与向上沟通表现',
      '独立负责一条完整业务线并对结果负责的经历',
      '技术实现的实际深度（对话中多为方案讨论而非落地细节）',
      '长期项目中的耐心与收尾质量',
    ],
    capabilities: [
      {
        title: '把模糊需求拆成可验证假设',
        strength: 'strong',
        detail:
          '在多个完全不同的主题里都先做同一件事：把一句含糊的诉求改写成"如果……那么应该能观察到……"的可证伪形式，再决定做什么。',
        evidence: [
          {
            quote: '先别急着定方案，我们得先确认用户到底是不想用，还是不知道怎么用。',
            source: '第 14 段对话',
          },
          {
            quote: '我把这个假设拆成三条，只有第二条是真正需要验证的。',
            source: '第 31 段对话',
          },
        ],
      },
      {
        title: '用最小成本换取真实反馈',
        strength: 'repeated',
        detail:
          '倾向于用极低成本的原型、脚本或手动流程去替代完整开发，先拿到真实反应再决定是否投入。',
        evidence: [
          {
            quote: '这个功能先用人工后台顶两周，验证有人用再写代码。',
            source: '第 8 段对话',
          },
          { quote: '做个能点的假页面就够了，不用接后端。', source: '第 22 段对话' },
        ],
      },
      {
        title: '对匹配机制的长期兴趣',
        strength: 'repeated',
        detail:
          '横跨数月的记录里反复回到同一类问题：如何让合适的人、内容或机会更准确地相遇。这是兴趣而非一时任务。',
        evidence: [
          { quote: '推荐做得再准，也解决不了双方意愿不对等的问题。', source: '第 5 段对话' },
          { quote: '我想知道冷启动阶段怎么让第一批人愿意暴露真实需求。', source: '第 27 段对话' },
        ],
      },
      {
        title: '主动收敛发散讨论',
        strength: 'early',
        detail:
          '在讨论展开过多时会主动叫停并给出取舍标准，但这类片段出现次数还不够多，暂列为初步信号。',
        evidence: [{ quote: '我们扯远了，回到这周必须决定的那一件事。', source: '第 19 段对话' }],
      },
    ],
    strengths: [
      '问题尚未被定义清楚、需要有人先划出边界的阶段',
      '决策链条短、可以直接接触真实用户的团队',
      '允许用粗糙原型换取信息，而不是要求先出完整方案',
      '同事愿意直接反驳结论，而不是回避冲突',
    ],
    risks: [
      '需求已经完全确定、只要求按排期交付的执行型岗位',
      '决策需要跨多层审批、验证周期以季度计的组织',
      '以工时和产出量为主要评价标准的环境',
      '强调职能边界清晰、不鼓励跨界介入的团队',
    ],
    riskNote:
      '这些风险值得关注，是因为记录里的驱动力几乎全部来自"想弄清楚一个问题"，而不是"完成一个被指派的目标"。当环境不提供问题定义空间时，这份驱动力会迅速失效，而不是转化为稳定执行。',
    roles: [
      {
        role: '早期团队的产品负责人（0→1 方向）',
        verdict: 'great',
        reason:
          '需要同时定义问题、做原型、跑用户，且允许方案在验证中被推翻，与记录中的工作方式高度重合。',
        boundary: '前提是团队规模小到他能直接接触用户，且不需要长期维护已有业务。',
      },
      {
        role: '创始人办公室 / 战略与产品之间的角色',
        verdict: 'depends',
        reason:
          '跨职能切换和快速学习的特征匹配，但这类角色的影响力依赖组织信任，而记录无法证明他的向上沟通能力。',
        boundary: '取决于创始人是否真的把决策空间下放，否则会退化为执行支持。',
      },
      {
        role: '社区 / 匹配类产品的机制设计',
        verdict: 'great',
        reason: '他对匹配机制的兴趣是长期且自发的，不需要额外动机就会持续投入。',
        boundary: '需要确认他更想设计机制，还是愿意亲自下场做冷启动运营。',
      },
      {
        role: '成熟产品的迭代优化岗',
        verdict: 'avoid',
        reason:
          '这类岗位的价值来自在既定框架内做精细优化，而记录中几乎看不到他在约束框架内长期打磨的证据。',
        boundary: '并非能力不足，而是驱动力不在这里，容易在半年内失去投入。',
      },
    ],
    nextQuestions: [
      '有没有一个你独立负责到结束、并且对结果负责的项目？发生了什么？',
      '你最近一次被数据推翻判断是什么时候？你怎么处理的？',
      '你更享受设计一套机制，还是亲自把第一批用户拉进来？',
      '在需要说服他人才能推进的场景里，你通常怎么做？',
    ],
  }
}

export function buildCareerProfile(model: CandidateModel): CareerProfile {
  const report = model.reviewerReport
  const traits = report
    ? report.mechanisms.slice(0, 4).map((mechanism) => ({
        title: mechanism.name,
        detail: mechanism.description,
        confidence: mechanism.confidence,
        evidence:
          mechanism.contexts.length > 0
            ? mechanism.contexts.join(' / ')
            : model.sourceLabel,
      }))
    : model.dimensions.slice(0, 4).map((dimension) => ({
        title: dimension.label,
        detail: dimension.detail,
        confidence: dimension.confidence,
        evidence: model.sourceLabel,
      }))

  return {
    title: model.headline,
    intent: report?.definition ?? '正在寻找：早期团队中可以定义问题的产品角色',
    initials: 'WG',
    traits:
      traits.length > 0
        ? traits
        : model.dimensions.slice(0, 4).map((dimension) => ({
            title: dimension.label,
            detail: dimension.detail,
            confidence: dimension.confidence,
            evidence: model.sourceLabel,
          })),
  }
}
