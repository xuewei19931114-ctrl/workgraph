import type { Transcript } from '../shared/profile-schemas'
export type {
  CandidateModel as CanonicalCandidateModel,
  ProfileJob,
  ProfileModelResponse,
} from '../shared/profile-schemas'

export type TabKey = 'upload' | 'chat' | 'jobs' | 'profile'

/** 证据强度。`unknown` 表示对话里没有足够材料下判断，会被明确保留而不是猜测。 */
export type Confidence = 'high' | 'medium' | 'unknown'

export type ParseStatus = 'reading' | 'ready' | 'error'

export interface ArchiveStats {
  conversations: number
  messages: number
}

export interface ParsedArchive {
  stats: ArchiveStats
  transcript: Transcript
}

export interface PickedFile {
  id: string
  name: string
  size: number
  status: ParseStatus
  archive?: ParsedArchive
  error?: string
}

export interface EvidenceItem {
  quote: string | null
  narrative?: string
  source: string
}

export interface Capability {
  title: string
  strength: 'strong' | 'repeated' | 'early'
  detail: string
  evidence: EvidenceItem[]
}

export interface ModelDimension {
  label: string
  confidence: Confidence
  detail: string
}

export interface RoleMatch {
  role: string
  verdict: 'great' | 'depends' | 'avoid'
  reason: string
  boundary: string
}

export interface ReviewerEpisode {
  title: string
  narrative: string
  quote: string | null
  source: string
  protectedStandard: string
}

export interface ReviewerMechanism {
  name: string
  description: string
  contexts: string[]
  confirmed: string[]
  missing: string[]
  confidence: Confidence
}

export interface ReviewerCompetitor {
  name: string
  type: string
  explains: string[]
  failsToExplain: string[]
  isWinner: boolean
}

export interface ReviewerReport {
  nameEn: string
  definition: string
  whyThisNotThat: string
  coreLoopNarrative: string
  whyDifferent: string
  explanatoryConfidenceLabel: string
  outcomeConfidenceLabel: string
  episodes: ReviewerEpisode[]
  mechanisms: ReviewerMechanism[]
  capabilities: Array<{
    name: string
    emergentLogic: string
    episodeTitles: string[]
  }>
  competingArchetypes: ReviewerCompetitor[]
  counterargument: {
    argument: string
    whatItExplains: string
    whatItFailsToExplain: string
    whyItDoesOrDoesNotWin: string
  }
  strengthRisks: Array<{
    strength: string
    risk: string
  }>
  hiringManagerSummary: string
}

export interface CandidateModel {
  generatedAt: number
  headline: string
  thesis: string
  dimensionCount: number
  sourceLabel: string
  unknownCount: number
  dimensions: ModelDimension[]
  cannotProve: string[]
  capabilities: Capability[]
  strengths: string[]
  risks: string[]
  riskNote: string
  roles: RoleMatch[]
  nextQuestions: string[]
  reviewerReport?: ReviewerReport
}

export interface ProfileTrait {
  title: string
  detail: string
  confidence: Confidence
  evidence: string
}

export interface CareerProfile {
  title: string
  intent: string
  initials: string
  traits: ProfileTrait[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  text: string
  /** 只有刚生成的智能体回复才会走打字机动画，历史消息直接完整渲染。 */
  animate?: boolean
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
}

export interface Job {
  id: string
  company: string
  badge: string
  role: string
  meta: string
  match: number
  reason: string
  evidence: string[]
  verify: string
}

export interface ImportRecord {
  id: string
  name: string
  at: number
  stats: ArchiveStats
}

export interface Account {
  email: string
  provider: 'email' | 'chatgpt' | 'guest'
}
