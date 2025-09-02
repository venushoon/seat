import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Trash2, Shuffle, Save, Download, Upload, Printer,
  Lock, Unlock, Users, Import, X
} from 'lucide-react'
import type { Group, Student, Gender, Mode } from './lib/types'

type Pair = { aId: string; bId: string }

const gid = () => Math.random().toString(36).slice(2, 9)
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function parseBulk(text: string): Student[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/([^/\s,|]+)[/\s,|]*(남|여)?/)
      const name = m?.[1] || line
      const gender = (m?.[2] as Gender) || '미정'
      return { id: gid(), name, gender, locked: false } as Student
    })
}

/** 해밀턴 라운딩: 목표 합을 정확히 맞추도록 floor 후 큰 소수부 순으로 +1 배분 */
function hamiltonRound(values: number[], totalTarget: number): number[] {
  const floors = values.map(Math.floor)
  let sum = floors.reduce((a,b)=>a+b,0)
  const fracts = values.map((v,i)=>({i, frac: v - Math.floor(v)})).sort((a,b)=>b.frac - a.frac)
  const out = [...floors]
  let idx = 0
  while (sum < totalTarget && idx < fracts.length) {
    out[fracts[idx].i]++; sum++; idx++
  }
  return out
}

export default function App() {
  // ===== 데이터 =====
  const [students, setStudents] = useState<Student[]>([])
  const [groups, setGroups] = useState<Group[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({ id: gid(), name: `${i + 1}모둠`, students: [] }))
  )

  // ===== 옵션 =====
  const [groupCount, setGroupCount] = useState<number>(4)     // 2~8
  const [minPerGroup, setMinPerGroup] = useState<number>(3)   // 2~8
  const [maxPerGroup, setMaxPerGroup] = useState<number>(4)   // ≥ minPerGroup, ≤ 8
  const [mode, setMode] = useState<Mode>('성비균형')           // 성비균형 | 완전랜덤 | 남여섞기OFF
  const [filterUnplaced, setFilterUnplaced] = useState<boolean>(false)
  const [bulk, setBulk] = useState<string>('')

  // ===== 제약(친구/떼기) =====
  const [friendPairs, setFriendPairs] = useState<Pair[]>([])
  const [antiPairs, setAntiPairs] = useState<Pair[]>([])
  const [selA, setSelA] = useState(''), [selB, setSelB] = useState('')
  const [selA2, setSelA2] = useState(''), [selB2, setSelB2] = useState('')

  // ===== 자동 저장/로드 =====
  useEffect(() => {
    const saved = localStorage.getItem('seat-arranger:auto')
    if (saved) {
      try {
        const p = JSON.parse(saved)
        setStudents(p.students || []); setGroups(p.groups || [])
        setGroupCount(p.groupCount ?? 4); setMinPerGroup(p.minPerGroup ?? 3)
        setMaxPerGroup(p.maxPerGroup ?? 4); setMode(p.mode || '성비균형')
        setFriendPairs(p.friendPairs || []); setAntiPairs(p.antiPairs || [])
      } catch {}
    }
  }, [])
  useEffect(() => {
    const payload = { students, groups, groupCount, minPerGroup, maxPerGroup, mode, friendPairs, antiPairs }
    localStorage.setItem('seat-arranger:auto', JSON.stringify(payload))
  }, [students, groups, groupCount, minPerGroup, maxPerGroup, mode, friendPairs, antiPairs])

  // ===== 그룹 수 변경 =====
  useEffect(() => {
    setGroups(prev => {
      const resized = [...prev]
      if (groupCount > prev.length) {
        for (let i = prev.length; i < groupCount; i++)
          resized.push({ id: gid(), name: `${i + 1}모둠`, students: [] })
      } else if (groupCount < prev.length) {
        const removed = resized.splice(groupCount)
        const returned = removed.flatMap(g => g.students)
        if (returned.length) setStudents(s => [...s, ...returned.map(st => ({ ...st, locked: false }))])
      }
      return resized.map((g, i) => ({ ...g, name: `${i + 1}모둠` }))
    })
  }, [groupCount])

  // ===== 옵션 보정 =====
  useEffect(() => { setMinPerGroup(v => Math.max(2, Math.min(8, v))) }, [])
  useEffect(() => { if (maxPerGroup < minPerGroup) setMaxPerGroup(minPerGroup) }, [minPerGroup])
  useEffect(() => { setMaxPerGroup(v => Math.max(3, Math.min(8, v))) }, [])

  // ===== 학생 삭제 시 제약 정리 =====
  useEffect(() => {
    const ids = new Set(students.map(s => s.id))
    setFriendPairs(ps => ps.filter(p => ids.has(p.aId) && ids.has(p.bId)))
    setAntiPairs(ps => ps.filter(p => ids.has(p.aId) && ids.has(p.bId)))
  }, [students])

  // ===== 파생 =====
  const placedIds = useMemo(() => new Set(groups.flatMap(g => g.students.map(s => s.id))), [groups])
  const capacity = groupCount * maxPerGroup
  const total = students.length
  const capacityNote = capacity < total ? `⚠️ 자리(${capacity}) < 학생(${total})` : capacity > total ? `남는 자리: ${capacity - total}` : '정확히 맞음'
  const findGroupIdxOf = (id: string) => groups.findIndex(g => g.students.some(s => s.id === id))
  const groupNameOf = (id: string) => {
    const gi = findGroupIdxOf(id)
    return gi >= 0 ? groups[gi].name : ''
  }

  // ===== 유틸 =====
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addRow = () => setStudents(s => [...s, { id: gid(), name: '', gender: '미정', locked: false }])
  const clearAll = () => { if (!confirm('모든 그룹 배치를 초기화하고 미배치로 돌립니다.')) return; setGroups(gs => gs.map(g => ({ ...g, students: [] }))) }
  const removeStudent = (id: string) => { setStudents(s => s.filter(x => x.id !== id)); setGroups(gs => gs.map(g => ({ ...g, students: g.students.filter(x => x.id !== id) }))) }
  const toggleLock = (id: string) => {
    setStudents(s => s.map(x => x.id === id ? { ...x, locked: !x.locked } : x))
    setGroups(gs => gs.map(g => ({ ...g, students: g.students.map(x => x.id === id ? { ...x, locked: !x.locked } : x) })))
  }
  const moveOut = (id: string) => {
    let moved: Student | null = null
    setGroups(prev => prev.map(g => ({ ...g, students: g.students.filter(s => { if (s.id === id) { moved = s; return false } return true }) })))
    if (moved) setStudents(s => [...s, { ...moved!, locked: false }])
  }
  const applyBulk = () => { const parsed = parseBulk(bulk); if (!parsed.length) return; setStudents(s => [...s, ...parsed]); setBulk('') }
  const nameOf = (id: string) => students.find(s => s.id === id)?.name || '(이름없음)'

  // ===== 성별 규칙/제약 헬퍼 =====
  const groupGenderOf = (g: Group): Gender | '혼합' | '비어있음' => {
    if (g.students.length === 0) return '비어있음'
    const set = new Set(g.students.map(s => s.gender))
    if (set.has('남') && set.has('여')) return '혼합'
    if (set.has('남')) return '남'
    if (set.has('여')) return '여'
    return '비어있음'
  }
  const canAddTo = (g: Group, st: Student): boolean => {
    if (g.students.length >= maxPerGroup) return false
    if (mode !== '남여섞기OFF') return true
    if (st.gender === '미정') return false
    const gg = groupGenderOf(g)
    if (gg === '비어있음') return true
    if (gg === '혼합') return false
    return gg === st.gender
  }

  // === 빠른 수동 배치 (원자 처리 & 성공시에만 목록 제거) ===
  function assignToGroup(stuId: string, gidx: number) {
    const st: Student | undefined =
      students.find(s => s.id === stuId) ||
      groups.flatMap(g => g.students).find(s => s.id === stuId)
    if (!st) return

    const inStudents = students.some(s => s.id === stuId)
    let added = false

    setGroups(prev => {
      if (gidx < 0 || gidx >= prev.length) return prev
      let fromIdx = -1
      const stripped = prev.map((g, i) => {
        const exists = g.students.some(s => s.id === stuId)
        if (exists) fromIdx = i
        return { ...g, students: g.students.filter(s => s.id !== stuId) }
      })
      if (fromIdx === gidx) return prev

      const target = stripped[gidx]
      if (!canAddTo(target, st)) return prev
      if (target.students.length >= maxPerGroup) return prev

      stripped[gidx] = { ...target, students: [...target.students, st] }
      added = true
      return stripped
    })

    if (inStudents && added) {
      setStudents(ss => ss.filter(x => x.id !== stuId))
    }
  }

  // ===== DnD =====
  const startDrag = (id: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', id)
  }
  const onDropToGroup = (gidx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    assignToGroup(id, gidx)
  }

  // ===== 배치 알고리즘 =====
  function arrange() {
    const gc = Math.max(2, Math.min(8, groupCount))
    const minG = Math.max(2, Math.min(8, minPerGroup))
    const maxG = Math.max(minG, Math.min(8, maxPerGroup))

    if (students.length < minG * gc) { alert(`학생 수가 부족합니다. 최소 ${gc}×${minG} = ${minG * gc}명 필요`); return }

    // 1) 잠금 유지 + 풀(pool)
    const lockedIds = new Set<string>()
    const pool: Student[] = []
    const nextGroups: Group[] = groups.slice(0, gc).map((g) => ({
      ...g,
      students: g.students.filter((s) => {
        if (s.locked) { lockedIds.add(s.id); return true }
        pool.push(s); return false
      })
    }))
    const alreadyPlaced = new Set(nextGroups.flatMap(g => g.students.map(s => s.id)))
    students.forEach(s => { if (!lockedIds.has(s.id) && !alreadyPlaced.has(s.id)) pool.push(s) })

    // 2) 그룹 타깃 인원(최소/최대 + 공평 분배: 섞기 모드에서 사용)
    const lockedCounts = nextGroups.map(g => g.students.length)
    const totalNow = lockedIds.size + pool.length
    const targets = Array(gc).fill(0).map((_,i)=>Math.max(minG, Math.min(maxG, lockedCounts[i])))

    // 3) 풀 분해
    let males = shuffleArray(pool.filter(s => s.gender === '남'))
    let females = shuffleArray(pool.filter(s => s.gender === '여'))
    let others = shuffleArray(pool.filter(s => s.gender === '미정'))
    const order = shuffleArray(Array.from({ length: gc }, (_, i) => i))

    const put = (idx: number, st: Student) => {
      const g = nextGroups[idx]
      if (g.students.length >= maxG) return false
      if (!canAddTo(g, st)) return false
      nextGroups[idx] = { ...g, students: [...g.students, st] }
      return true
    }

    // === 남/여 섞지 않기: 남자 우선 최소인원 충족 → 나머지 그룹을 여자로 ===
    if (mode === '남여섞기OFF') {
      // 후보 그룹 분류
      const malePrefer: number[] = []
      const empty: number[] = []
      const femalePrefer: number[] = []

      nextGroups.forEach((g, i) => {
        const gg = groupGenderOf(g)
        if (gg === '혼합') return // 블록
        if (gg === '남') malePrefer.push(i)
        else if (gg === '여') femalePrefer.push(i)
        else empty.push(i)
      })

      // 남자 그룹 수 결정: 기존 남 그룹 + 비어있는 그룹 사용, 최소인원 보장 가능 수 만큼
      const baseMaleGroups = malePrefer.slice()
      const extraMaleGroupsNeeded = Math.max(0, Math.floor(males.length / minG) - baseMaleGroups.length)
      const chosenMale = baseMaleGroups.concat(empty.slice(0, extraMaleGroupsNeeded)).slice(0, gc)

      // 1) 남자 그룹에 최소인원 라운드로빈 배치
      for (let round = 0; round < minG; round++) {
        for (const gi of chosenMale) {
          if (!males.length) break
          if (nextGroups[gi].students.length >= maxG) continue
          if (put(gi, males[0])) males.shift()
        }
      }
      // 2) 남자 그룹에 남은 인원 정원까지 배치
      outerM: while (males.length) {
        let progressed = false
        for (const gi of chosenMale) {
          if (!males.length) break outerM
          if (put(gi, males[0])) { males.shift(); progressed = true }
        }
        if (!progressed) break
      }

      // 여자 그룹 후보: 기존 여 + 남자 선택되지 않은 비어있는 그룹
      const usedMaleSet = new Set(chosenMale)
      const femaleCandidates = femalePrefer.concat(empty.filter(i => !usedMaleSet.has(i)))

      // 3) 여자 그룹에 최소인원 라운드로빈 배치
      for (let round = 0; round < minG; round++) {
        for (const gi of femaleCandidates) {
          if (!females.length) break
          if (nextGroups[gi].students.length >= maxG) continue
          if (put(gi, females[0])) females.shift()
        }
      }
      // 4) 여자 그룹에 남은 인원 정원까지 배치
      outerF: while (females.length) {
        let progressed = false
        for (const gi of femaleCandidates) {
          if (!females.length) break outerF
          if (put(gi, females[0])) { females.shift(); progressed = true }
        }
        if (!progressed) break
      }

      // 미정 성별은 규칙상 배치하지 않고 미배치 유지
      // 완료
    } else if (mode === '성비균형') {
      // 섞기 모드: 성비 타깃 후 배치
      const totalPool = males.length + females.length + others.length
      const maleRatio = totalPool ? males.length / totalPool : 0.5
      // 목표 총 좌석(잠금 포함)
      const seats = targets.reduce((a,b)=>a+b,0)
      const maleTargets = hamiltonRound(targets.map(t => t * maleRatio), Math.min(males.length, seats))

      const counts = nextGroups.map(g => ({
        m: g.students.filter(s => s.gender === '남').length,
        f: g.students.filter(s => s.gender === '여').length,
        o: g.students.filter(s => s.gender === '미정').length,
      }))

      // 남 우선 충족
      for (const gi of order) {
        while (nextGroups[gi].students.length < targets[gi] && males.length && counts[gi].m < maleTargets[gi]) {
          if (put(gi, males[0])) { males.shift(); counts[gi].m++ } else break
        }
      }
      // 나머지(여/미정)
      for (const gi of order) {
        while (nextGroups[gi].students.length < targets[gi] && (females.length || others.length)) {
          const st = females.length ? females.shift()! : others.shift()!
          if (!put(gi, st)) break
        }
      }
      // 가벼운 보정은 생략(충분히 안정적)
    } else {
      // 완전랜덤
      let all = shuffleArray([...males, ...females, ...others])
      for (const gi of order) {
        while (nextGroups[gi].students.length < targets[gi] && all.length) {
          const st = all.shift()!
          if (!put(gi, st)) break
        }
      }
    }

    setGroups(nextGroups)
    // pool에서 못 들어간 남은 인원(특히 남여섞기OFF에서 최소 미달)은 그대로 students에 남아 "미배치" 상태로 보이게 됩니다.
  }

  // ===== 저장/불러오기/내보내기/인쇄 =====
  function saveAs() {
    const name = prompt('저장 이름을 입력하세요 (예: 2학기-6학년-1반)'); if (!name) return
    const saves = JSON.parse(localStorage.getItem('seat-arranger:saves') || '{}')
    saves[name] = { students, groups, groupCount, minPerGroup, maxPerGroup, mode, friendPairs, antiPairs, savedAt: new Date().toISOString() }
    localStorage.setItem('seat-arranger:saves', JSON.stringify(saves)); alert('저장되었습니다.')
  }
  function loadFrom() {
    const saves = JSON.parse(localStorage.getItem('seat-arranger:saves') || '{}')
    const keys = Object.keys(saves); if (!keys.length) return alert('저장된 항목이 없습니다.')
    const name = prompt(`불러올 이름을 입력하세요\n${keys.join('\n')}`); if (!name || !saves[name]) return
    const s = saves[name]
    setStudents(s.students || []); setGroups(s.groups || [])
    setGroupCount(s.groupCount ?? 4); setMinPerGroup(s.minPerGroup ?? 3); setMaxPerGroup(s.maxPerGroup ?? 4)
    setMode(s.mode || '성비균형'); setFriendPairs(s.friendPairs || []); setAntiPairs(s.antiPairs || [])
  }
  function exportCSV() {
    const rows: string[] = []
    groups.forEach((g) => { rows.push(`${g.name}`); g.students.forEach((s, idx) => rows.push(`${idx + 1},${s.name},${s.gender}`)); rows.push('') })
    const csv = `번호,이름,성별\n` + rows.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '모둠편성.csv'; a.click(); URL.revokeObjectURL(url)
  }
  function exportJSON() {
    const data = { students, groups, groupCount, minPerGroup, maxPerGroup, mode, friendPairs, antiPairs }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'seat-arranger.json'; a.click(); URL.revokeObjectURL(url)
  }
  function importJSON(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result))
        setStudents(obj.students || []); setGroups(obj.groups || [])
        setGroupCount(obj.groupCount ?? 4); setMinPerGroup(obj.minPerGroup ?? 3); setMaxPerGroup(obj.maxPerGroup ?? 4)
        setMode(obj.mode || '성비균형'); setFriendPairs(obj.friendPairs || []); setAntiPairs(obj.antiPairs || [])
      } catch { alert('JSON 파싱 실패') }
    }
    reader.readAsText(file); ev.currentTarget.value = ''
  }

  // ===== UI =====
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white print:bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 grid place-items-center">
              <Users className="w-5 h-5 text-blue-700" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-800">자리배치 · 모둠편성</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 print:p-0">
        <div className="grid grid-cols-12 gap-6">
          {/* ===== 왼쪽: 옵션 + 제약 + 데이터 ===== */}
          <aside className="col-span-12 lg:col-span-4 print:hidden">
            <div className="sticky top-[72px] space-y-4">
              {/* 편성 옵션 */}
              <section className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-blue"></span>
                    <h2 className="section-title">편성 옵션</h2>
                  </div>
                  <span className="badge">{mode === '남여섞기OFF' ? '남/여 분리' : '혼합 허용'}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[.92rem]">
                  <label className="form-label">모둠 수
                    <input type="number" min={2} max={8} value={groupCount}
                      onChange={(e)=>setGroupCount(Math.min(8, Math.max(2, parseInt(e.target.value || '4'))))}
                      className="input input-sm" />
                  </label>

                  <label className="form-label">최소 인원
                    <input type="number" min={2} max={8} value={minPerGroup}
                      onChange={(e)=>{ const v = Math.max(2, Math.min(8, parseInt(e.target.value || '3'))); setMinPerGroup(v); if (maxPerGroup < v) setMaxPerGroup(v) }}
                      className="input input-sm" />
                  </label>

                  <label className="form-label">인원 상한
                    <input type="number" min={Math.max(3, minPerGroup)} max={8} value={maxPerGroup}
                      onChange={(e)=>{ const v = Math.max(minPerGroup, Math.min(8, parseInt(e.target.value || String(minPerGroup)))); setMaxPerGroup(v) }}
                      className="input input-sm" />
                  </label>

                  <label className="form-label col-span-2">편성 방법
                    <select value={mode} onChange={(e)=>setMode(e.target.value as Mode)} className="input input-sm">
                      <option value="성비균형">성비 균형 (남녀 섞음)</option>
                      <option value="완전랜덤">완전 랜덤 (섞음)</option>
                      <option value="남여섞기OFF">남/여 섞지 않기</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <div>총 <b>{students.length}</b> · 수용 <b>{groupCount * maxPerGroup}</b></div>
                  <div className={(groupCount * maxPerGroup) < students.length ? 'text-red-600' : 'text-slate-600'}>{capacityNote}</div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button onClick={arrange} className="btn-primary"><Shuffle className="icon-left" />자동 편성</button>
                  <button onClick={clearAll} className="btn-ghost"><Trash2 className="icon-left" />초기화</button>
                </div>
              </section>

              {/* 제약(친구/떼기) */}
              <section className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-purple"></span>
                    <h2 className="section-title">제약 (친구/떼기)</h2>
                  </div>
                </div>

                {/* 친구(같이) */}
                <div className="mb-2">
                  <div className="text-[.85rem] font-semibold text-slate-700 mb-1.5">친구(같이 배치)</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="input input-sm" value={selA} onChange={(e)=>setSelA(e.target.value)}>
                      <option value="">학생 A</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                    <select className="input input-sm" value={selB} onChange={(e)=>setSelB(e.target.value)}>
                      <option value="">학생 B</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-sm" onClick={()=>{
                    if (!selA || !selB || selA===selB) return
                    const exists = friendPairs.some(p=>(p.aId===selA && p.bId===selB)||(p.aId===selB && p.bId===selA))
                    const conflicted = antiPairs.some(p=>(p.aId===selA && p.bId===selB)||(p.aId===selB && p.bId===selA))
                    if (conflicted) { alert('이미 떼기 제약에 존재합니다.'); return }
                    if (!exists) setFriendPairs(ps=>[...ps,{aId:selA,bId:selB}]); setSelA(''); setSelB('')
                  }}>추가</button>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {friendPairs.map((p, i)=>(
                      <span key={`f-${i}`} className="tag tag-emerald">
                        {nameOf(p.aId)} ↔ {nameOf(p.bId)}
                        <button className="ml-1 inline-flex" onClick={()=>setFriendPairs(ps => ps.filter((_,idx)=>idx!==i))}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {!friendPairs.length && <span className="text-xs text-slate-400">친구 제약이 없습니다.</span>}
                  </div>
                </div>

                <hr className="my-3 border-slate-200" />

                {/* 떼기 */}
                <div>
                  <div className="text-[.85rem] font-semibold text-slate-700 mb-1.5">떼기(같은 모둠 금지)</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="input input-sm" value={selA2} onChange={(e)=>setSelA2(e.target.value)}>
                      <option value="">학생 A</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                    <select className="input input-sm" value={selB2} onChange={(e)=>setSelB2(e.target.value)}>
                      <option value="">학생 B</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-sm" onClick={()=>{
                    if (!selA2 || !selB2 || selA2===selB2) return
                    const exists = antiPairs.some(p=>(p.aId===selA2 && p.bId===selB2)||(p.aId===selB2 && p.bId===selA2))
                    const conflicted = friendPairs.some(p=>(p.aId===selA2 && p.bId===selB2)||(p.aId===selB2 && p.bId===selA2))
                    if (conflicted) { alert('이미 친구 제약에 존재합니다.'); return }
                    if (!exists) setAntiPairs(ps=>[...ps,{aId:selA2,bId:selB2}]); setSelA2(''); setSelB2('')
                  }}>추가</button>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {antiPairs.map((p, i)=>(
                      <span key={`a-${i}`} className="tag tag-rose">
                        {nameOf(p.aId)} ≠ {nameOf(p.bId)}
                        <button className="ml-1 inline-flex" onClick={()=>setAntiPairs(ps => ps.filter((_,idx)=>idx!==i))}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {!antiPairs.length && <span className="text-xs text-slate-400">떼기 제약이 없습니다.</span>}
                  </div>
                </div>
              </section>

              {/* 데이터 & 출력 (작게) */}
              <section className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="chip chip-emerald"></span>
                  <h2 className="section-title">데이터 & 출력</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={saveAs} className="btn btn-sm"><Save className="icon-left" />저장</button>
                  <button onClick={loadFrom} className="btn btn-sm"><Upload className="icon-left" />불러오기</button>
                  <button onClick={exportCSV} className="btn btn-sm"><Download className="icon-left" />CSV</button>
                  <button onClick={exportJSON} className="btn btn-sm"><Download className="icon-left" />JSON</button>
                  <label className="btn btn-sm cursor-pointer col-span-2">
                    <Import className="icon-left" />JSON 불러오기
                    <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importJSON}/>
                  </label>
                  <button onClick={()=>window.print()} className="btn btn-sm col-span-2"><Printer className="icon-left" />인쇄</button>
                </div>
              </section>
            </div>
          </aside>

          {/* ===== 오른쪽: 학생 목록(프린트 제외) + 모둠 카드 ===== */}
          <section className="col-span-12 lg:col-span-8">
            {/* 학생 목록 — 인쇄 제외 */}
            <section className="card p-4 mb-6 print:hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span className="chip chip-amber"></span><h2 className="section-title">학생 목록</h2></div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={filterUnplaced} onChange={(e)=>setFilterUnplaced(e.target.checked)} />
                    미배치만
                  </label>
                  <button onClick={addRow} className="btn btn-sm"><Plus className="icon-left" />추가</button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-2 mb-2">
                <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)}
                  placeholder={"여러 줄 붙여넣기 예)\n김철수/남\n이영희/여\n박민수 남"} className="input input-sm md:col-span-2 h-24" />
                <button onClick={applyBulk} className="btn-accent">붙여넣기 추가</button>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[320px] overflow-auto">
                  <table className="w-full text-[0.9rem]">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="text-left text-slate-600">
                        <th className="p-2 w-8">#</th>
                        <th className="p-2">이름</th>
                        <th className="p-2 w-24">성별</th>
                        <th className="p-2 w-36">상태</th>
                        <th className="p-2 w-20">이동</th>
                        <th className="p-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filterUnplaced ? students.filter(s=>!placedIds.has(s.id)) : students).map((s, i) => {
                        const placed = placedIds.has(s.id)
                        const gname = placed ? groupNameOf(s.id) : ''
                        return (
                          <tr key={s.id} className={`border-t ${placed ? 'bg-indigo-50/35' : ''}`}>
                            <td className="p-2 text-slate-500">{i + 1}</td>
                            <td className="p-2">
                              <input value={s.name} onChange={(e)=>setStudents(prev=>prev.map(x=>x.id===s.id?{...x, name:e.target.value}:x))} className="input input-sm" placeholder="이름" />
                            </td>
                            <td className="p-2">
                              <select value={s.gender} onChange={(e)=>setStudents(prev=>prev.map(x=>x.id===s.id?{...x, gender:e.target.value as Gender}:x))} className="input input-sm">
                                <option value="미정">미정</option><option value="남">남</option><option value="여">여</option>
                              </select>
                            </td>
                            <td className="p-2 text-[.85rem]">
                              <span className={`inline-flex items-center gap-1 ${placed ? 'text-indigo-700' : 'text-slate-600'}`}>
                                {placed ? <>배치됨 · <b>{gname}</b></> : '미배치'}
                              </span>
                            </td>
                            <td className="p-2">
                              <select
                                className="input input-sm"
                                defaultValue=""
                                onChange={(e) => {
                                  const v = parseInt(e.target.value)
                                  if (!Number.isNaN(v)) assignToGroup(s.id, v - 1)
                                  e.currentTarget.value = ''
                                }}
                              >
                                <option value="">모둠</option>
                                {groups.map((g, idx) => (
                                  <option key={g.id} value={idx + 1} disabled={g.students.length >= maxPerGroup}>
                                    {idx + 1}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-right">
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">{s.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}</button>
                              <button onClick={()=>removeStudent(s.id)} className="icon-btn text-rose-600" title="삭제"><Trash2 className="w-4 h-4"/></button>
                              <button draggable onDragStart={startDrag(s.id)} className="icon-btn" title="드래그하여 모둠으로 이동">↔︎</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 모둠 카드 */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><span className="chip chip-emerald"></span><h2 className="section-title">모둠 배치</h2></div>
                <span className="text-xs text-slate-500">
                  {groups.reduce((a,g)=>a+g.students.length,0)}명 배치됨 · 미배치 {students.filter(s=>!placedIds.has(s.id)).length}명
                </span>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {groups.map((g, gi) => (
                  <motion.div key={g.id} layout className="card p-3 print:shadow-none print:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-800">{g.name}</h3>
                      <span className="text-xs text-slate-500">{g.students.length}/{maxPerGroup}</span>
                    </div>

                    <div onDragOver={(e)=>e.preventDefault()} onDrop={onDropToGroup(gi)}
                      className={`min-h-[120px] grid grid-cols-1 gap-2 p-2 rounded-xl border-2 ${g.students.length<maxPerGroup?'border-dashed border-slate-300':'border-slate-200'}`}>
                      {g.students.map((s) => (
                        <motion.div key={s.id} layout className={`rounded-xl border bg-white shadow-sm ${s.locked ? 'ring-2 ring-amber-400' : ''}`}>
                          <div className="flex items-center justify-between px-3 py-2 rounded-xl" draggable onDragStart={startDrag(s.id)} title="드래그하여 다른 모둠으로 이동">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${s.gender==='남' ? 'bg-blue-100 text-blue-700' : s.gender==='여' ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}`}>{s.gender}</span>
                              <span className="font-medium text-slate-800">{s.name || '(이름)'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <select
                                className="input input-xxs"
                                defaultValue=""
                                onChange={(e) => {
                                  const v = parseInt(e.target.value)
                                  if (!Number.isNaN(v)) assignToGroup(s.id, v - 1)
                                  e.currentTarget.value = ''
                                }}
                                title="번호 선택으로 다른 모둠으로 이동"
                              >
                                <option value="">#</option>
                                {groups.map((gg, idx) => (
                                  <option key={gg.id} value={idx + 1} disabled={gg.students.length >= maxPerGroup || idx===gi}>
                                    {idx + 1}
                                  </option>
                                ))}
                              </select>
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">{s.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}</button>
                              <button onClick={()=>moveOut(s.id)} className="icon-btn text-slate-600" title="미배치로 이동">↩︎</button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {g.students.length===0 && (<div className="text-center text-slate-400 text-sm py-6">여기로 드래그하여 추가</div>)}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 text-center text-xs text-slate-500 print:hidden">인쇄 시 컨트롤·학생목록은 숨겨지고 모둠 카드만 출력됩니다.</div>
            </section>
          </section>
        </div>

        {/* 스타일 */}
        <style>{`
          :root{ --blue:#2563eb; --emerald:#10b981; --purple:#7c3aed; --amber:#f59e0b; --indigo:#4f46e5; }
          .btn{ display:inline-flex; align-items:center; gap:.5rem; padding:.55rem .85rem; border-radius:.85rem; border:1px solid rgb(226,232,240); background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.05); font-weight:600; font-size:.95rem; color:#0f172a; }
          .btn-sm{ padding:.35rem .55rem; font-size:.82rem; border-radius:.7rem; }
          .btn-primary{ display:inline-flex; align-items:center; gap:.5rem; padding:.55rem .9rem; border-radius:.9rem; background:var(--blue); color:#fff; font-weight:700; }
          .btn-ghost{ display:inline-flex; align-items:center; gap:.5rem; padding:.55rem .85rem; border-radius:.9rem; color:#334155; background:transparent; border:1px solid rgba(148,163,184,.35); }
          .btn-accent{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; padding:.55rem .85rem; border-radius:1rem; font-weight:800; background:linear-gradient(135deg,#34d399,#10b981); color:white; border:1px solid #a7f3d0; box-shadow:0 6px 14px -6px rgba(16,185,129,.4); }
          .icon-left{ width:1rem; height:1rem; margin-right:.1rem; }
          .input{ width:100%; padding:.5rem .7rem; border:1px solid rgb(226,232,240); border-radius:.75rem; background:#fff; }
          .input-sm{ padding:.4rem .55rem; border-radius:.6rem; font-size:.9rem; }
          .input-xxs{ width:auto; padding:.2rem .35rem; border:1px solid rgb(226,232,240); border-radius:.5rem; background:#fff; font-size:.75rem; }
          .form-label{ font-size:.9rem; color:#334155; display:flex; flex-direction:column; gap:.3rem; }
          .card{ background:#fff; border:1px solid rgb(226,232,240); border-radius:1rem; box-shadow:0 1px 2px rgba(0,0,0,.05); }
          .icon-btn{ width:1.8rem; height:1.8rem; border-radius:9999px; display:inline-flex; align-items:center; justify-content:center; }
          .section-title{ font-size:1rem; font-weight:700; color:#0f172a; }
          .badge{ font-size:.7rem; padding:.15rem .5rem; border-radius:.5rem; background:#eef2ff; color:#4338ca; border:1px solid #e0e7ff; }
          .chip{ width:.55rem; height:.55rem; border-radius:9999px; display:inline-block; }
          .chip-blue{ background:linear-gradient(135deg,#dbeafe,#93c5fd); border:1px solid #bfdbfe; }
          .chip-emerald{ background:linear-gradient(135deg,#d1fae5,#86efac); border:1px solid #a7f3d0; }
          .chip-purple{ background:linear-gradient(135deg,#ede9fe,#c4b5fd); border:1px solid #ddd6fe; }
          .chip-amber{ background:linear-gradient(135deg,#fef3c7,#fcd34d); border:1px solid #fde68a; }
          .tag{ display:inline-flex; align-items:center; gap:.25rem; padding:.2rem .5rem; border-radius:.6rem; font-size:.8rem; border:1px solid rgb(226,232,240); }
          .tag-emerald{ background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
          .tag-rose{ background:#fff1f2; color:#9f1239; border-color:#fecdd3; }
          @media print {
            header, .print\\:hidden { display:none !important; }
            body { background:white !important; }
            .card { box-shadow:none !important; border:none !important; }
            .btn, .btn-primary, .btn-ghost, .btn-accent, .btn-sm, .input, .input-xxs, .input-sm, textarea, select, label { display:none !important; }
          }
        `}</style>
      </main>
    </div>
  )
}
