import type { Student, Group } from '../lib/types'

export interface SheetsAPI {
  loadRoster(sheetId: string, range: string): Promise<Student[]>
  saveArrangement(sheetId: string, range: string, groups: Group[]): Promise<void>
}

export const SheetsNotConfigured: SheetsAPI = {
  async loadRoster() { throw new Error('Sheets 연동 미설정') },
  async saveArrangement() { throw new Error('Sheets 연동 미설정') }
}
