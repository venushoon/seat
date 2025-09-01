import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Trash2, Shuffle, Save, Download, Upload, Printer,
  Lock, Unlock, Users, Settings2, Import, X
} from 'lucide-react'
import type { Group, Student, Gender, Mode } from './lib/types'

/** 로컬 타입(제약) */
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

export default function App() {
  const [students, setStudents] = useState<Student[]>([])
  const [groups, setGroups] = useState<Group[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({
      id: gid(),
      name: `${i + 1}모둠`,
      students: []
    }))
  )

  // ===== 옵션 상태 =====
  const [groupCount, setGroupCount] = useState<number>(4)        // 2~8
  const [minPerGroup, setMinPerGroup] = useState<number>(3)      // 2~8 (권장 3)
  const [maxPerGroup, setMaxPerGroup] = useState<number>(4)      // 3~8
  const [mode, setMode] = useState<Mode>('성비균형')
  const [mixGender, setMixGender] = useState<boolean>(true)
  const [filterUnplaced, setFilterUnplaced] = useState<boolean>(false)
  const [bulk, setBulk] = useState<string>('')

  // ===== 제약(친구/떼기) =====
  const [friendPairs, setFriendPairs] = useState<Pair[]>([])   // 같이
  const [antiPairs, setAntiPairs] = useState<Pair[]>([])       // 떼기
  const [selA, setSelA] = useState<string>('') // UI 선택
  const [selB, setSelB] = useState<string>('')
  const [selA2, setSelA2] = useState<string>('') // 떼기용
  const [selB2, setSelB2] = useState<string>('')

  // PWA 설치 프롬프트
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installAvailable, setInstallAvailable] = useState(false)
  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallAvailable(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])
  const onInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setInstallAvailable(false)
  }

  // 자동 저장/로드
  useEffect(() => {
    const saved = localStorage.getItem('seat-arranger:auto')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setStudents(parsed.students || [])
        setGroups(parsed.groups || [])
        setGroupCount(parsed.groupCount ?? 4)
        setMinPerGroup(parsed.minPerGroup ?? 3)
        setMaxPerGroup(parsed.maxPerGroup ?? 4)
        setMode(parsed.mode || '성비균형')
        setMixGender(parsed.mixGender ?? true)
        setFriendPairs(parsed.friendPairs || [])
        setAntiPairs(parsed.antiPairs || [])
      } catch {}
    }
  }, [])
  useEffect(() => {
    const payload = {
      students, groups, groupCount, minPerGroup, maxPerGroup, mode, mixGender,
      friendPairs, antiPairs
    }
    localStorage.setItem('seat-arranger:auto', JSON.stringify(payload))
  }, [students, groups, groupCount, minPerGroup, maxPerGroup, mode, mixGender, friendPairs, antiPairs])

  // 그룹 수 변경 시 그룹 배열 재구성
  useEffect(() => {
    setGroups((prev) => {
      const resized = [...prev]
      if (groupCount > prev.length) {
        for (let i = prev.length; i < groupCount; i++)
          resized.push({ id: gid(), name: `${i + 1}모둠`, students: [] })
      } else if (groupCount < prev.length) {
        const removed = resized.splice(groupCount)
        const returned = removed.flatMap((g) => g.students)
        if (returned.length)
          setStudents((s) => [
            ...s,
            ...returned.map((st) => ({ ...st, locked: false }))
          ])
      }
      return resized.map((g, i) => ({ ...g, name: `${i + 1}모둠` }))
    })
  }, [groupCount])

  // 옵션 상호 제약 보정
  useEffect(() => { setMinPerGroup((v) => Math.max(2, Math.min(8, v))) }, [])
  useEffect(() => { if (maxPerGroup < minPerGroup) setMaxPerGroup(minPerGroup) }, [minPerGroup])
  useEffect(() => { setMaxPerGroup((v) => Math.max(3, Math.min(8, v))) }, [])

  // 학생 삭제/변경 시 제약 클린업
  useEffect(() => {
    const ids = new Set(students.map(s=>s.id))
    setFriendPairs(ps => ps.filter(p => ids.has(p.aId) && ids.has(p.bId)))
    setAntiPairs(ps => ps.filter(p => ids.has(p.aId) && ids.has(p.bId)))
  }, [students])

  const placedIds = useMemo(
    () => new Set(groups.flatMap((g) => g.students.map((s) => s.id))),
    [groups]
  )
  const capacity = groupCount * maxPerGroup
  const total = students.length
  const capacityNote =
    capacity < total
      ? `⚠️ 자리(${capacity}) < 학생(${total})`
      : capacity > total
      ? `남는 자리: ${capacity - total}`
      : '정확히 맞음'

  // 드래그앤드롭
  const dragId = useRef<string | null>(null)
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    dragId.current = id
    e.dataTransfer.setData('text/plain', id)
  }
  const onDropToGroup = (gidx: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId.current
    if (!id) return
    let moved: Student | null = null
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        students: g.students.filter((s) => {
          if (s.id === id) {
            moved = s
            return false
          }
          return true
        })
      }))
    )
    setStudents((prev) =>
      prev.filter((s) => {
        if (s.id === id) {
          moved = s
          return false
        }
        return true
      })
    )
    setGroups((prev) => {
      if (!moved) return prev
      const clone = [...prev]
      if (clone[gidx].students.find((s) => s.id === moved!.id)) return clone
      if (clone[gidx].students.length >= maxPerGroup) return clone
      clone[gidx] = { ...clone[gidx], students: [...clone[gidx].students, moved!] }
      return clone
    })
    dragId.current = null
  }

  // 순환 제너레이터
  function* cycle(arr: number[]) { let k=0; while(true) yield arr[k++ % arr.length] }

  // ====== 제약 만족 유틸 ======
  const findGroupIdxOf = (gs: Group[], id: string) =>
    gs.findIndex(g => g.students.some(s => s.id === id))
  const canAddTo = (g: Group) => g.students.length < maxPerGroup
  const isLocked = (id: string) => {
    for (const g of groups) {
      const st = g.students.find(s=>s.id===id)
      if (st && st.locked) return true
    }
    const st0 = students.find(s=>s.id===id)
    return st0?.locked ?? false
  }

  function tryMove(gs: Group[], stuId: string, toIdx: number): boolean {
    if (isLocked(stuId)) return false
    const fromIdx = findGroupIdxOf(gs, stuId)
    if (fromIdx === -1 || fromIdx === toIdx) return false
    const to = gs[toIdx]
    if (!canAddTo(to)) return false
    const from = gs[fromIdx]
    const moved = from.students.find(s=>s.id===stuId)!
    gs[fromIdx] = { ...from, students: from.students.filter(s=>s.id!==stuId) }
    gs[toIdx] = { ...to, students: [...to.students, moved] }
    return true
  }

  function trySwap(gs: Group[], aId: string, bId: string): boolean {
    if (isLocked(aId) || isLocked(bId)) return false
    const ai = findGroupIdxOf(gs, aId)
    const bi = findGroupIdxOf(gs, bId)
    if (ai === -1 || bi === -1 || ai === bi) return false
    const ga = gs[ai], gb = gs[bi]
    const a = ga.students.find(s=>s.id===aId)!
    const b = gb.students.find(s=>s.id===bId)!
    // swap은 상한 변화 없음 — 항상 가능
    gs[ai] = { ...ga, students: ga.students.map(s=>s.id===aId? b : s) }
    gs[bi] = { ...gb, students: gb.students.map(s=>s.id===bId? a : s) }
    return true
  }

  /** 친구 제약: 서로 다른 그룹이면 a를 b의 그룹으로 이동(여유席) or 스왑 */
  function satisfyFriends(gs: Group[]) {
    const order = [...friendPairs]
    for (const p of order) {
      const ai = findGroupIdxOf(gs, p.aId)
      const bi = findGroupIdxOf(gs, p.bId)
      if (ai === -1 || bi === -1 || ai === bi) continue
      // 여유가 있으면 a→b 이동 시도
      if (canAddTo(gs[bi]) && tryMove(gs, p.aId, bi)) continue
      // a쪽에 여유가 있으면 b→a
      if (canAddTo(gs[ai]) && tryMove(gs, p.bId, ai)) continue
      // 스왑 시도 (a ↔ b 그룹 내 임의 멤버 1명)
      const candA = gs[ai].students.find(s=>!isLocked(s.id) && s.id!==p.aId)
      const candB = gs[bi].students.find(s=>!isLocked(s.id) && s.id!==p.bId)
      if (candA && trySwap(gs, candA.id, p.bId)) continue
      if (candB && trySwap(gs, p.aId, candB.id)) continue
      // 실패해도 넘어감(모든 제약을 100% 보장하긴 어려움)
    }
  }

  /** 떼기 제약: 같은 그룹이면 한 명을 이웃 그룹으로 이동(여유席) or 스왑 */
  function satisfyAntis(gs: Group[]) {
    const order = [...antiPairs]
    for (const p of order) {
      const ai = findGroupIdxOf(gs, p.aId)
      const bi = findGroupIdxOf(gs, p.bId)
      if (ai === -1 || bi === -1) continue
      if (ai !== bi) continue // 이미 분리됨
      // 같은 그룹이면 b를 다른 그룹으로 이동
      const toOrder = shuffleArray(Array.from({length: groupCount}, (_,i)=>i).filter(i=>i!==ai))
      let done = false
      for (const ti of toOrder) {
        if (canAddTo(gs[ti]) && tryMove(gs, p.bId, ti)) { done = true; break }
      }
      if (done) continue
      // 이동 불가 → 스왑
      for (const ti of toOrder) {
        const cand = gs[ti].students.find(s=>!isLocked(s.id))
        if (cand && trySwap(gs, p.bId, cand.id)) { done = true; break }
      }
      // 실패해도 넘어감
    }
  }

  // ===== 편성 알고리즘 (최소 인원/상한 + 제약 반영) =====
  function arrange() {
    // 현재 입력값을 안전 범위로 스냅
    const gc = Math.max(2, Math.min(8, groupCount))
    const minG = Math.max(2, Math.min(8, minPerGroup))
    const maxG = Math.max(minG, Math.min(8, maxPerGroup))

    // 0) 기본 검사
    if (students.length < minG * gc) {
      alert(`학생 수가 부족합니다. 최소 ${gc}×${minG} = ${minG * gc}명 필요`)
      return
    }

    // 1) 잠금 유지 + 풀(pool) 재구성
    const lockedIds = new Set<string>()
    const pool: Student[] = []
    const nextGroups: Group[] = groups.slice(0, gc).map((g) => ({
      ...g,
      students: g.students.filter((s) => {
        if (s.locked) { lockedIds.add(s.id); return true }
        pool.push(s); return false
      })
    }))
    // 미배치 학생 합치기
    const alreadyPlaced = new Set(nextGroups.flatMap(g=>g.students.map(s=>s.id)))
    students.forEach(s => { if (!lockedIds.has(s.id) && !alreadyPlaced.has(s.id)) pool.push(s) })

    // 2) 타깃 인원 계산
    const totalNow = lockedIds.size + pool.length
    const lockedCounts = nextGroups.map(g => g.students.length)

    // 초기 타깃: 각 모둠 = max(잠금인원, 최소 인원), 상한은 maxG
    const targets = Array.from({length: gc}, (_, i) =>
      Math.min(maxG, Math.max(minG, lockedCounts[i] || 0))
    )

    let sumTargets = targets.reduce((a,b)=>a+b,0)

    // 필요합이 총원보다 크면(학생이 적으면) 타깃을 낮춘다(잠금/최소는 유지)
    if (sumTargets > totalNow) {
      let toReduce = sumTargets - totalNow
      const floors = targets.map((_, i) => Math.max(minG, lockedCounts[i] || 0))
      let idx = 0
      while (toReduce > 0) {
        if (targets[idx] > floors[idx]) { targets[idx]--; toReduce-- }
        idx = (idx + 1) % gc
      }
      sumTargets = totalNow
    }

    // 남는 인원은 타깃을 +1씩 라운드로빈으로 분배(상한은 maxG)
    if (sumTargets < totalNow) {
      let toAdd = totalNow - sumTargets
      let idx = 0
      while (toAdd > 0) {
        if (targets[idx] < maxG) { targets[idx]++; toAdd-- }
        idx = (idx + 1) % gc
      }
    }

    // 3) 성별/모드별 풀 준비
    let males = shuffleArray(pool.filter((s) => s.gender === '남'))
    let females = shuffleArray(pool.filter((s) => s.gender === '여'))
    let others = shuffleArray(pool.filter((s) => s.gender === '미정'))

    // 4) 배치 도우미
    const order = shuffleArray(Array.from({ length: gc }, (_, i) => i))
    const canPut = (idx: number) => nextGroups[idx].students.length < targets[idx]
    const put = (idx: number, st: Student) => {
      if (canPut(idx)) {
        nextGroups[idx] = { ...nextGroups[idx], students: [...nextGroups[idx].students, st] }
        return true
      }
      return false
    }

    // 5) 실제 배치(기본 균형)
    if (!mixGender || mode === '완전랜덤') {
      let all = shuffleArray([...males, ...females, ...others])
      outer: for (let idx of cycle(order)) {
        while (canPut(idx) && all.length) {
          const st = all.shift()!
          put(idx, st)
          if (!all.length) break outer
        }
      }
    } else if (mode === '성비균형') {
      const totalPool = males.length + females.length + others.length
      const maleRatio = totalPool ? males.length / totalPool : 0.5
      // 각 모둠 타깃 내 남자 목표치
      const targetMale = targets.map(t => Math.round(t * maleRatio))
      const counts = nextGroups.map((g) => ({
        m: g.students.filter((s) => s.gender === '남').length,
        f: g.students.filter((s) => s.gender === '여').length,
        o: g.students.filter((s) => s.gender === '미정').length,
      }))

      outer2: for (let idx of cycle(order)) {
        while (canPut(idx)) {
          let chosen: Student | undefined
          if (males.length && counts[idx].m < targetMale[idx]) { chosen = males.shift(); counts[idx].m++ }
          else if (females.length && (nextGroups[idx].students.length + 1) <= targets[idx]) { chosen = females.shift(); counts[idx].f++ }
          else if (others.length) { chosen = others.shift(); counts[idx].o++ }
          else if (males.length) { chosen = males.shift(); counts[idx].m++ }
          else if (females.length) { chosen = females.shift(); counts[idx].f++ }
          else break outer2
          put(idx, chosen!)
        }
      }
    }

    // 6) 제약 충족(친구→떼기 순, 몇 차례 시도)
    const MAX_ITERS = 3
    for (let t = 0; t < MAX_ITERS; t++) {
      satisfyFriends(nextGroups)
      satisfyAntis(nextGroups)
    }

    setGroups(nextGroups)
  }

  // 저장/불러오기/내보내기
  function saveAs() {
    const name = prompt('저장 이름을 입력하세요 (예: 2학기-6학년-1반)')
    if (!name) return
    const saves = JSON.parse(localStorage.getItem('seat-arranger:saves') || '{}')
    saves[name] = {
      students, groups, groupCount, minPerGroup, maxPerGroup, mode, mixGender,
      friendPairs, antiPairs,
      savedAt: new Date().toISOString()
    }
    localStorage.setItem('seat-arranger:saves', JSON.stringify(saves))
    alert('저장되었습니다.')
  }
  function loadFrom() {
    const saves = JSON.parse(localStorage.getItem('seat-arranger:saves') || '{}')
    const keys = Object.keys(saves)
    if (!keys.length) return alert('저장된 항목이 없습니다.')
    const name = prompt(`불러올 이름을 입력하세요\n${keys.join('\n')}`)
    if (!name || !saves[name]) return
    const s = saves[name]
    setStudents(s.students || [])
    setGroups(s.groups || [])
    setGroupCount(s.groupCount ?? 4)
    setMinPerGroup(s.minPerGroup ?? 3)
    setMaxPerGroup(s.maxPerGroup ?? 4)
    setMode(s.mode || '성비균형')
    setMixGender(s.mixGender ?? true)
    setFriendPairs(s.friendPairs || [])
    setAntiPairs(s.antiPairs || [])
  }
  function exportCSV() {
    const rows: string[] = []
    groups.forEach((g) => {
      rows.push(`${g.name}`)
      g.students.forEach((s, idx) => rows.push(`${idx + 1},${s.name},${s.gender}`))
      rows.push('')
    })
    const csv = `번호,이름,성별\n` + rows.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '모둠편성.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  function exportJSON() {
    const data = {
      students, groups, groupCount, minPerGroup, maxPerGroup, mode, mixGender,
      friendPairs, antiPairs
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'seat-arranger.json'; a.click()
    URL.revokeObjectURL(url)
  }
  function importJSON(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result))
        setStudents(obj.students || [])
        setGroups(obj.groups || [])
        setGroupCount(obj.groupCount ?? 4)
        setMinPerGroup(obj.minPerGroup ?? 3)
        setMaxPerGroup(obj.maxPerGroup ?? 4)
        setMode(obj.mode || '성비균형')
        setMixGender(obj.mixGender ?? true)
        setFriendPairs(obj.friendPairs || [])
        setAntiPairs(obj.antiPairs || [])
      } catch {
        alert('JSON 파싱 실패')
      }
    }
    reader.readAsText(file)
    ev.currentTarget.value = ''
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const addRow = () =>
    setStudents((s) => [...s, { id: gid(), name: '', gender: '미정', locked: false }])
  const clearAll = () => {
    if (!confirm('모든 그룹 배치를 초기화하고 미배치로 돌립니다.')) return
    setGroups((gs) => gs.map((g) => ({ ...g, students: [] })))
  }
  const removeStudent = (id: string) => {
    setStudents((s) => s.filter((x) => x.id !== id))
    setGroups((gs) => gs.map((g) => ({ ...g, students: g.students.filter((x) => x.id !== id) })))
  }
  const toggleLock = (id: string) => {
    setStudents((s) => s.map((x) => (x.id === id ? { ...x, locked: !x.locked } : x)))
    setGroups((gs) => gs.map((g) => ({
      ...g,
      students: g.students.map((x) => (x.id === id ? { ...x, locked: !x.locked } : x))
    })))
  }
  const moveOut = (id: string) => {
    let moved: Student | null = null
    setGroups((prev) => prev.map((g) => ({
      ...g,
      students: g.students.filter((s) => {
        if (s.id === id) { moved = s; return false }
        return true
      })
    })))
    if (moved) setStudents((s) => [...s, { ...moved!, locked: false }])
  }
  const applyBulk = () => {
    const parsed = parseBulk(bulk)
    if (!parsed.length) return
    setStudents((s) => [...s, ...parsed])
    setBulk('')
  }

  // ====== UI ======
  const nameOf = (id: string) => students.find(s=>s.id===id)?.name || '(이름없음)'

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
          <div className="flex items-center gap-2">
            {installAvailable && (
              <button onClick={onInstall} className="btn-primary">PWA 설치</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 print:p-0">
        <div className="grid grid-cols-12 gap-6">
          {/* ===== 왼쪽 사이드바 (옵션 + 파일/출력 + 제약) ===== */}
          <aside className="col-span-12 lg:col-span-4 print:hidden">
            <div className="sticky top-[72px] space-y-4">
              {/* 편성 옵션 */}
              <section className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-blue"></span>
                    <h2 className="section-title">편성 옵션</h2>
                  </div>
                  <span className="badge">설정</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="form-label">모둠 수
                    <input
                      type="number" min={2} max={8} value={groupCount}
                      onChange={(e)=>setGroupCount(Math.min(8, Math.max(2, parseInt(e.target.value || '4'))))}
                      className="input"
                    />
                  </label>

                  <label className="form-label">최소 인원
                    <input
                      type="number" min={2} max={8} value={minPerGroup}
                      onChange={(e)=>{
                        const v = Math.max(2, Math.min(8, parseInt(e.target.value || '3')))
                        setMinPerGroup(v)
                        if (maxPerGroup < v) setMaxPerGroup(v)
                      }}
                      className="input"
                    />
                  </label>

                  <label className="form-label">인원 상한
                    <input
                      type="number" min={Math.max(3, minPerGroup)} max={8} value={maxPerGroup}
                      onChange={(e)=>{
                        const v = Math.max(minPerGroup, Math.min(8, parseInt(e.target.value || String(minPerGroup))))
                        setMaxPerGroup(v)
                      }}
                      className="input"
                    />
                  </label>

                  <label className="form-label col-span-2">편성 방법
                    <select value={mode} onChange={(e)=>setMode(e.target.value as Mode)} className="input">
                      <option value="성비균형">성비 균형</option>
                      <option value="완전랜덤">완전 랜덤</option>
                      <option value="남여섞기OFF">남/여 섞지 않기</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 col-span-2 text-[0.95rem]">
                    <input type="checkbox" checked={mixGender} onChange={(e)=>setMixGender(e.target.checked)} />
                    <span>남녀 함께 조합 허용</span>
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                  <div>총 학생 <b>{students.length}</b> · 수용 <b>{groupCount * maxPerGroup}</b></div>
                  <div className={(groupCount * maxPerGroup) < students.length ? 'text-red-600' : 'text-slate-600'}>{capacityNote}</div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button onClick={arrange} className="btn-primary lg:btn-lg">
                    <Shuffle className="icon-left" />자동 편성
                  </button>
                  <button onClick={clearAll} className="btn-ghost lg:btn-lg">
                    <Trash2 className="icon-left" />초기화
                  </button>
                </div>
              </section>

              {/* 제약: 친구/떼기 */}
              <section className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-purple"></span>
                    <h2 className="section-title">제약 (친구/떼기)</h2>
                  </div>
                  <span className="badge">선택</span>
                </div>

                {/* 친구(같이) */}
                <div className="mb-3">
                  <div className="text-sm font-semibold text-slate-700 mb-2">친구(같이 배치)</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="input" value={selA} onChange={(e)=>setSelA(e.target.value)}>
                      <option value="">학생 A</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                    <select className="input" value={selB} onChange={(e)=>setSelB(e.target.value)}>
                      <option value="">학생 B</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                  </div>
                  <button
                    className="btn"
                    onClick={()=>{
                      if (!selA || !selB || selA===selB) return
                      const exists = friendPairs.some(p=>(p.aId===selA && p.bId===selB)||(p.aId===selB && p.bId===selA))
                      const conflicted = antiPairs.some(p=>(p.aId===selA && p.bId===selB)||(p.aId===selB && p.bId===selA))
                      if (conflicted) { alert('이미 떼기 제약에 존재합니다.'); return }
                      if (!exists) setFriendPairs(ps=>[...ps,{aId:selA,bId:selB}])
                      setSelA(''); setSelB('')
                    }}
                  >
                    추가
                  </button>

                  {/* 리스트 표시 */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {friendPairs.map((p, i)=>(
                      <span key={`f-${i}`} className="tag tag-emerald">
                        {nameOf(p.aId)} ↔ {nameOf(p.bId)}
                        <button className="ml-1 inline-flex" onClick={()=>setFriendPairs(ps => ps.filter((_,idx)=>idx!==i))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {!friendPairs.length && <span className="text-xs text-slate-400">추가된 친구 제약이 없습니다.</span>}
                  </div>
                </div>

                <hr className="my-3 border-slate-200" />

                {/* 떼기 */}
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">떼기(같은 모둠 금지)</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="input" value={selA2} onChange={(e)=>setSelA2(e.target.value)}>
                      <option value="">학생 A</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                    <select className="input" value={selB2} onChange={(e)=>setSelB2(e.target.value)}>
                      <option value="">학생 B</option>
                      {students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}
                    </select>
                  </div>
                  <button
                    className="btn"
                    onClick={()=>{
                      if (!selA2 || !selB2 || selA2===selB2) return
                      const exists = antiPairs.some(p=>(p.aId===selA2 && p.bId===selB2)||(p.aId===selB2 && p.bId===selA2))
                      const conflicted = friendPairs.some(p=>(p.aId===selA2 && p.bId===selB2)||(p.aId===selB2 && p.bId===selA2))
                      if (conflicted) { alert('이미 친구 제약에 존재합니다.'); return }
                      if (!exists) setAntiPairs(ps=>[...ps,{aId:selA2,bId:selB2}])
                      setSelA2(''); setSelB2('')
                    }}
                  >
                    추가
                  </button>

                  {/* 리스트 표시 */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {antiPairs.map((p, i)=>(
                      <span key={`a-${i}`} className="tag tag-rose">
                        {nameOf(p.aId)} ≠ {nameOf(p.bId)}
                        <button className="ml-1 inline-flex" onClick={()=>setAntiPairs(ps => ps.filter((_,idx)=>idx!==i))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {!antiPairs.length && <span className="text-xs text-slate-400">추가된 떼기 제약이 없습니다.</span>}
                  </div>
                </div>
              </section>

              {/* 데이터 & 출력 */}
              <section className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="chip chip-emerald"></span>
                  <h2 className="section-title">데이터 & 출력</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={saveAs} className="btn">
                    <Save className="icon-left" />저장
                  </button>
                  <button onClick={loadFrom} className="btn">
                    <Upload className="icon-left" />불러오기
                  </button>
                  <button onClick={exportCSV} className="btn">
                    <Download className="icon-left" />CSV
                  </button>
                  <button onClick={exportJSON} className="btn">
                    <Download className="icon-left" />JSON
                  </button>

                  <label className="btn cursor-pointer col-span-2">
                    <Import className="icon-left" />JSON 불러오기
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={importJSON}
                    />
                  </label>

                  <button onClick={()=>window.print()} className="btn col-span-2">
                    <Printer className="icon-left" />인쇄
                  </button>
                </div>
              </section>
            </div>
          </aside>

          {/* ===== 오른쪽 콘텐츠 (학생 목록 + 모둠 카드) ===== */}
          <section className="col-span-12 lg:col-span-8">
            {/* 학생 목록 */}
            <section className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="chip chip-amber"></span>
                  <h2 className="section-title">학생 목록</h2>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filterUnplaced} onChange={(e)=>setFilterUnplaced(e.target.checked)} />
                    미배치만
                  </label>
                  <button onClick={addRow} className="btn">
                    <Plus className="icon-left" />추가
                  </button>
                </div>
              </div>

              {/* 일괄 붙여넣기 */}
              <div className="grid md:grid-cols-3 gap-3 mb-3">
                <textarea
                  value={bulk}
                  onChange={(e)=>setBulk(e.target.value)}
                  placeholder={"여러 줄 붙여넣기 예)\n김철수/남\n이영희/여\n박민수 남"}
                  className="input md:col-span-2 h-24"
                />
                <button onClick={applyBulk} className="btn-primary">붙여넣기 추가</button>
              </div>

              {/* 테이블 */}
              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-[0.95rem]">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="text-left text-slate-600">
                        <th className="p-2 w-10">#</th>
                        <th className="p-2">이름</th>
                        <th className="p-2 w-28">성별</th>
                        <th className="p-2 w-28">상태</th>
                        <th className="p-2 w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filterUnplaced ? students.filter(s=>!placedIds.has(s.id)) : students).map((s, i) => (
                        <tr key={s.id} className="border-t">
                          <td className="p-2 text-slate-500">{i + 1}</td>
                          <td className="p-2">
                            <input
                              value={s.name}
                              onChange={(e)=>setStudents((prev)=>prev.map(x=>x.id===s.id?{...x, name:e.target.value}:x))}
                              className="input" placeholder="이름"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={s.gender}
                              onChange={(e)=>setStudents((prev)=>prev.map(x=>x.id===s.id?{...x, gender:e.target.value as Gender}:x))}
                              className="input"
                            >
                              <option value="미정">미정</option>
                              <option value="남">남</option>
                              <option value="여">여</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1 text-slate-600">
                              {placedIds.has(s.id) ? '배치됨' : '미배치'}
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">
                              {s.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
                            </button>
                            <button onClick={()=>removeStudent(s.id)} className="icon-btn text-rose-600" title="삭제">
                              <Trash2 className="w-4 h-4"/>
                            </button>
                            <button draggable onDragStart={onDragStart(s.id)} className="icon-btn" title="드래그하여 모둠으로 이동">↔︎</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 모둠 카드 그리드 */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="chip chip-emerald"></span>
                  <h2 className="section-title">모둠 배치</h2>
                </div>
                <span className="text-xs text-slate-500">
                  {groups.reduce((a,g)=>a+g.students.length,0)}명 배치됨
                </span>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {groups.map((g, gi) => (
                  <motion.div key={g.id} layout className="card p-3 print:shadow-none print:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-800">{g.name}</h3>
                      <span className="text-xs text-slate-500">{g.students.length}/{maxPerGroup}</span>
                    </div>

                    <div
                      onDragOver={(e)=>e.preventDefault()}
                      onDrop={onDropToGroup(gi)}
                      className={`min-h-[120px] grid grid-cols-1 gap-2 p-2 rounded-xl border-2 ${g.students.length<maxPerGroup?'border-dashed border-slate-300':'border-slate-200'}`}
                    >
                      {g.students.map((s) => (
                        <motion.div key={s.id} layout className={`rounded-xl border bg-white shadow-sm ${s.locked ? 'ring-2 ring-amber-400' : ''}`}>
                          <div
                            className="flex items-center justify-between px-3 py-2 rounded-xl"
                            draggable
                            onDragStart={onDragStart(s.id)}
                            title="드래그하여 다른 모둠으로 이동"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                s.gender==='남' ? 'bg-blue-100 text-blue-700'
                                  : s.gender==='여' ? 'bg-pink-100 text-pink-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>{s.gender}</span>
                              <span className="font-medium text-slate-800">{s.name || '(이름)'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">
                                {s.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
                              </button>
                              <button onClick={()=>moveOut(s.id)} className="icon-btn text-slate-600" title="미배치로 이동">↩︎</button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {g.students.length===0 && (
                        <div className="text-center text-slate-400 text-sm py-6">여기로 드래그하여 추가</div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 text-center text-xs text-slate-500 print:hidden">
                인쇄 시 컨트롤은 숨겨지고 모둠 카드만 출력됩니다.
              </div>
            </section>
          </section>
        </div>

        {/* 스타일 */}
        <style>{`
          :root{
            --blue:#2563eb; --emerald:#10b981; --purple:#7c3aed; --amber:#f59e0b;
          }
          .btn{ display:inline-flex; align-items:center; gap:.5rem; padding:.6rem .9rem; border-radius:.9rem;
                border:1px solid rgb(226,232,240); background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.05);
                font-weight:600; font-size:.95rem; color:#0f172a; }
          .btn-lg{ padding:.7rem 1rem; font-size:1rem; }
          .btn-primary{ display:inline-flex; align-items:center; gap:.5rem; padding:.6rem 1rem; border-radius:1rem;
                        background:var(--blue); color:#fff; font-weight:700; letter-spacing:.01em; }
          .btn-ghost{ display:inline-flex; align-items:center; gap:.5rem; padding:.6rem .9rem; border-radius:1rem;
                      color:#334155; background:transparent; border:1px solid rgba(148,163,184,.35); }
          .icon-left{ width:1rem; height:1rem; margin-right:.1rem; }
          .input{ width:100%; padding:.55rem .75rem; border:1px solid rgb(226,232,240); border-radius:.85rem; background:#fff; }
          .form-label{ font-size:.95rem; color:#334155; display:flex; flex-direction:column; gap:.35rem; }
          .card{ background:#fff; border:1px solid rgb(226,232,240); border-radius:1rem; box-shadow:0 1px 2px rgba(0,0,0,.05); }
          .icon-btn{ width:2rem; height:2rem; border-radius:9999px; display:inline-flex; align-items:center; justify-content:center; }
          .section-title{ font-size:1rem; font-weight:700; color:#0f172a; }
          .badge{ font-size:.7rem; padding:.15rem .5rem; border-radius:.5rem; background:#eef2ff; color:#4338ca; border:1px solid #e0e7ff; }
          .chip{ width:.6rem; height:.6rem; border-radius:9999px; display:inline-block; }
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
            .btn, .btn-primary, .btn-ghost, .input, textarea, select { display:none !important; }
          }
        `}</style>
      </main>
    </div>
  )
}
