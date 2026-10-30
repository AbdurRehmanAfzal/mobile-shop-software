/** The AI features (owner 2026-10-30): status (is a key set, today's allowance) and photo reading. */

import { useModules } from '@/lib/modules'
import { useGet } from '@/lib/queries'

export interface AiStatus { configured: boolean; model: string | null; used_today: number; limit: number }

/** null while the module is off, so screens can hide the feature without a request */
export function useAiStatus() {
  const has = useModules()
  return useGet<AiStatus>(['ai-status'], has('ai') ? '/api/v1/ai/status' : null)
}

export interface CnicAi { kind: 'cnic'; cnic: string | null; name: string | null; father_name: string | null; gender: 'M' | 'F' | null; dob: string | null; issue: string | null; expiry: string | null }
export interface ImeiAi { kind: 'imei'; imei1: string | null; imei2: string | null; serial: string | null; brand: string | null; model: string | null; storage: string | null; colour: string | null }
