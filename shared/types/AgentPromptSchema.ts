import { z } from 'zod'

/**
 * `AgentPrompt` is a mapped type keyed by each prompt part's own `type`
 * (there are ~18 part shapes, see `shared/schema/PromptPartDefinitions.ts`).
 * A full schema mirroring every part's exact shape would duplicate most of
 * that file and drift out of sync with it. This is deliberately a loose
 * structural guard instead: the request body must be a plain object whose
 * values each carry a string `type` field. That's enough to turn "stale
 * client build / future version skew / a malformed request" into a clean
 * 400 at the route boundary instead of an unpredictable throw deep inside
 * `buildSystemPrompt`/`buildMessages` - it does not validate each part's
 * own internal fields.
 */
export const AgentPromptSchema = z.record(z.string(), z.looseObject({ type: z.string() }))
