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

export default function App() {
  // 데이터
  const [students, setStudents] = useState<Student[]>([])
  const [groups, setGroups] = useState<Group[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({ id: gid(), name: `${i + 1}모둠`, students: [] }))
  )

  // 옵션
  const [groupCount, setGroupCount] = useState<number>(4)   // 2~8
  const [minPerGroup, setMinPerGroup] = useState<number>(3) // 2~8
  const [maxPerGroup, setMaxPerGroup] = useState<number>(4) // ≥ minPerGroup, ≤ 8
  const [mode, setMode] = useState<Mode>('성비균형')         // 성비균형 | 완전랜덤 | 남여섞기OFF
  const [filterUnplaced, setFilterUnplaced] = useState<boolean>(false)
  const [bulk, setBulk] = useState<string>('')

  // 친구/떼기 제약
  const [friendPairs, setFriendPairs] = useState<Pair[]>([])
  const [antiPairs, setAntiPairs] = useState<Pair[]>([])
  const [selA, setSelA] = useState(''), [selB, setSelB] = useState('')
  const [selA2, setSelA2] = useState(''), [selB2, setSelB2] = useState('')

  // 자동 저장/로드
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

  // 그룹 수 변경
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

  // 옵션 보정
  useEffect(() => { setMinPerGroup(v => Math.max(2, Math.min(8, v))) }, [])
  useEffect(() => { if (maxPerGroup < minPerGroup) setMaxPerGroup(minPerGroup) }, [minPerGroup])
  useEffect(() => { setMaxPerGroup(v => Math.max(3, Math.min(8, v))) }, [])

  // 삭제 시 제약 정리
  useEffect(() => {
    const ids = new Set(students.map(s => s.id))
    setFriendPairs(ps => ps.filter(p => ids.has(p.aId) && ids.has(p.bId)))
    setAntiPairs(ps => ps.filter(p => ids.has(p.aId) && ids.has(p.bId)))
  }, [students])

  // 파생
  const placedIds = useMemo(() => new Set(groups.flatMap(g => g.students.map(s => s.id))), [groups])
  const capacity = groupCount * maxPerGroup
  const total = students.length
  const capacityNote = capacity < total ? `⚠️ 자리(${capacity}) < 학생(${total})` : capacity > total ? `남는 자리: ${capacity - total}` : '정확히 맞음'

  // ===== 배치 알고리즘 =====
  function arrange() {
    const gc = Math.max(2, Math.min(8, groupCount))
    const minG = Math.max(2, Math.min(8, minPerGroup))
    const maxG = Math.max(minG, Math.min(8, maxPerGroup))

    if (students.length < minG * gc) { alert(`학생 수가 부족합니다. 최소 ${gc}×${minG} = ${minG * gc}명 필요`); return }

    // 잠금 유지 + 풀
    const lockedIds = new Set<string>()
    const pool: Student[] = []
    const nextGroups: Group[] = groups.slice(0, gc).map((g) => ({
      ...g,
      students: g.students.filter((s) => { if (s.locked) { lockedIds.add(s.id); return true }; pool.push(s); return false })
    }))
    const alreadyPlaced = new Set(nextGroups.flatMap(g => g.students.map(s => s.id)))
    students.forEach(s => { if (!lockedIds.has(s.id) && !alreadyPlaced.has(s.id)) pool.push(s) })

    // 목표 인원
    const totalNow = lockedIds.size + pool.length
    const lockedCounts = nextGroups.map(g => g.students.length)
    const targets = Array.from({ length: gc }, (_, i) => Math.min(maxG, Math.max(minG, lockedCounts[i] || 0)))
    let sumTargets = targets.reduce((a, b) => a + b, 0)
    if (sumTargets > totalNow) {
      let needReduce = sumTargets - totalNow, idx = 0
      const floors = targets.map((_, i) => Math.max(minG, lockedCounts[i] || 0))
      while (needReduce > 0) { if (targets[idx] > floors[idx]) { targets[idx]--; needReduce-- } idx = (idx + 1) % gc }
      sumTargets = totalNow
    }
    if (sumTargets < totalNow) {
      let toAdd = totalNow - sumTargets, idx = 0
      while (toAdd > 0) { if (targets[idx] < maxG) { targets[idx]++; toAdd-- } idx = (idx + 1) % gc }
    }

    // 성별별 풀
    const males = shuffleArray(pool.filter(s => s.gender === '남'))
    const females = shuffleArray(pool.filter(s => s.gender === '여'))
    const others = shuffleArray(pool.filter(s => s.gender === '미정'))
    const order = shuffleArray(Array.from({ length: gc }, (_, i) => i))

    const canPut = (idx: number) => nextGroups[idx].students.length < targets[idx]
    const put = (idx: number, st: Student) => {
      if (!canPut(idx)) return false
      nextGroups[idx] = { ...nextGroups[idx], students: [...nextGroups[idx].students, st] }
      return true
    }
    function* cycle(arr: number[]) { let k = 0; while (true) yield arr[k++ % arr.length] }

    // 모드별 배치
    if (mode === '남여섞기OFF') {
      // 남자는 남자끼리, 여자는 여자끼리
      const fill = (queue: Student[]) => {
        for (let idx of cycle(order)) {
          if (!queue.length) break
          if (canPut(idx)) { put(idx, queue.shift()!) }
          const anySpace = nextGroups.some((g, gi) => nextGroups[gi].students.length < targets[gi])
          if (!anySpace) break
        }
      }
      fill(males); fill(females)
      // 미정은 자동배치 안 함 → 미배치
    } else if (mode === '성비균형') {
      const totalPool = males.length + females.length + others.length
      const maleRatio = totalPool ? males.length / totalPool : 0.5
      const targetMale = targets.map(t => Math.round(t * maleRatio))
      const counts = nextGroups.map(g => ({
        m: g.students.filter(s => s.gender === '남').length,
        f: g.students.filter(s => s.gender === '여').length,
        o: g.students.filter(s => s.gender === '미정').length
      }))
      outer: for (let idx of cycle(order)) {
        while (canPut(idx)) {
          let chosen: Student | undefined
          if (males.length && counts[idx].m < targetMale[idx]) { chosen = males.shift(); counts[idx].m++ }
          else if (females.length && (nextGroups[idx].students.length + 1) <= targets[idx]) { chosen = females.shift(); counts[idx].f++ }
          else if (others.length) { chosen = others.shift(); counts[idx].o++ }
          else if (males.length) { chosen = males.shift(); counts[idx].m++ }
          else if (females.length) { chosen = females.shift(); counts[idx].f++ }
          else break outer
          if (chosen) put(idx, chosen)
        }
      }
    } else { // 완전랜덤
      let all = shuffleArray([...males, ...females, ...others])
      outer2: for (let idx of cycle(order)) {
        while (canPut(idx) && all.length) { put(idx, all.shift()!) }
      }
    }

    setGroups(nextGroups)
  }

  // UI (상세 UI 부분은 동일, mode 선택에서 mixGender 체크박스 제거됨)
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white print:bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 grid place-items-center"><Users className="w-5 h-5 text-blue-700" /></div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-800">자리배치 · 모둠편성</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 print:p-0">
        {/* 왼쪽 옵션 */}
        <aside className="print:hidden">
          <section className="card p-5">
            <h2 className="section-title mb-2">편성 옵션</h2>
            <label>모둠 수 <input type="number" value={groupCount} onChange={e=>setGroupCount(parseInt(e.target.value))} /></label>
            <label>최소 인원 <input type="number" value={minPerGroup} onChange={e=>setMinPerGroup(parseInt(e.target.value))} /></label>
            <label>인원 상한 <input type="number" value={maxPerGroup} onChange={e=>setMaxPerGroup(parseInt(e.target.value))} /></label>
            <label>편성 방법
              <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>
                <option value="성비균형">성비 균형 (남녀 섞음)</option>
                <option value="완전랜덤">완전 랜덤</option>
                <option value="남여섞기OFF">남/여 섞지 않기</option>
              </select>
            </label>
            <button onClick={arrange}>자동 편성</button>
          </section>
        </aside>

        {/* 오른쪽 모둠 표시 */}
        <section>
          <h2 className="section-title">모둠 배치</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((g) => (
              <div key={g.id} className="card p-3">
                <h3>{g.name} ({g.students.length}/{maxPerGroup})</h3>
                {g.students.map(s=> <div key={s.id}>{s.name} ({s.gender})</div>)}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
