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
function hamiltonRound(values: number[], totalTarget: number): number[] {
  const floors = values.map(Math.floor)
  let sum = floors.reduce((a,b)=>a+b,0)
  const fracts = values.map((v,i)=>({i, frac: v - Math.floor(v)})).sort((a,b)=>b.frac - a.frac)
  const out = [...floors]
  let idx = 0
  while (sum < totalTarget && idx < fracts.length) { out[fracts[idx].i]++; sum++; idx++ }
  return out
}

export default function App() {
  // ===== 상태 =====
  const [students, setStudents] = useState<Student[]>([])
  const [groups, setGroups] = useState<Group[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({ id: gid(), name: `${i + 1}모둠`, students: [] }))
  )
  const [groupCount, setGroupCount] = useState<number>(4)
  const [minPerGroup, setMinPerGroup] = useState<number>(3)
  const [maxPerGroup, setMaxPerGroup] = useState<number>(4)
  const [mode, setMode] = useState<Mode>('성비균형')
  const [filterUnplaced, setFilterUnplaced] = useState(false)
  const [bulk, setBulk] = useState('')

  // 제약
  const [friendPairs, setFriendPairs] = useState<Pair[]>([])
  const [antiPairs, setAntiPairs] = useState<Pair[]>([])
  const [selA, setSelA] = useState(''), [selB, setSelB] = useState('')
  const [selA2, setSelA2] = useState(''), [selB2, setSelB2] = useState('')

  // 로드/저장
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

  useEffect(() => { setMinPerGroup(v => Math.max(2, Math.min(8, v))) }, [])
  useEffect(() => { if (maxPerGroup < minPerGroup) setMaxPerGroup(minPerGroup) }, [minPerGroup])
  useEffect(() => { setMaxPerGroup(v => Math.max(3, Math.min(8, v))) }, [])

  // 제약 정리
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
  const findGroupIdxOf = (id: string) => groups.findIndex(g => g.students.some(s => s.id === id))
  const groupNameOf = (id: string) => (findGroupIdxOf(id) >= 0 ? groups[findGroupIdxOf(id)].name : '')

  // 유틸
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

  // 규칙
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

  // 수동 배치(원자/성공시에만 목록 제거)
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
    if (inStudents && added) setStudents(ss => ss.filter(x => x.id !== stuId))
  }

  // DnD
  const startDrag = (id: string) => (e: React.DragEvent) => { e.dataTransfer.setData('text/plain', id) }
  const onDropToGroup = (gidx: number) => (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) assignToGroup(id, gidx) }

  // 자동 편성
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

    const lockedCounts = nextGroups.map(g => g.students.length)
    const targets = Array(gc).fill(0).map((_,i)=>Math.max(minG, Math.min(maxG, lockedCounts[i])))

    let males = shuffleArray(pool.filter(s => s.gender === '남'))
    let females = shuffleArray(pool.filter(s => s.gender === '여'))
    let others = shuffleArray(pool.filter(s => s.gender === '미정'))
    const order = shuffleArray(Array.from({ length: gc }, (_, i) => i))

    const canPut = (idx: number) => nextGroups[idx].students.length < targets[idx]
    const put = (idx: number, st: Student) => {
      const g = nextGroups[idx]
      if (g.students.length >= Math.min(targets[idx], maxG)) return false
      if (!canAddTo(g, st)) return false
      nextGroups[idx] = { ...g, students: [...g.students, st] }
      return true
    }

    if (mode === '남여섞기OFF') {
      const malePrefer:number[] = [], femalePrefer:number[] = [], empty:number[] = []
      nextGroups.forEach((g,i)=>{
        const gg = groupGenderOf(g)
        if (gg==='남') malePrefer.push(i)
        else if (gg==='여') femalePrefer.push(i)
        else if (gg==='비어있음') empty.push(i)
      })

      const baseMale = malePrefer.slice()
      const extraMaleNeeded = Math.max(0, Math.floor(males.length / minG) - baseMale.length)
      const chosenMale = baseMale.concat(empty.slice(0, extraMaleNeeded)).slice(0, gc)

      for (let r=0;r<minG;r++){ for (const gi of chosenMale){ if (!males.length) break; if (put(gi, males[0])) males.shift() } }
      outerM: while (males.length){
        let moved=false
        for (const gi of chosenMale){ if (!males.length) break outerM; if (put(gi, males[0])){ males.shift(); moved=true } }
        if (!moved) break
      }

      const usedMale = new Set(chosenMale)
      const femaleCands = femalePrefer.concat(empty.filter(i=>!usedMale.has(i)))

      for (let r=0;r<minG;r++){ for (const gi of femaleCands){ if (!females.length) break; if (put(gi, females[0])) females.shift() } }
      outerF: while (females.length){
        let moved=false
        for (const gi of femaleCands){ if (!females.length) break outerF; if (put(gi, females[0])){ females.shift(); moved=true } }
        if (!moved) break
      }

      const fillRest = (que: Student[]) => {
        if (!que.length) return
        for (const gi of order) {
          while (que.length && nextGroups[gi].students.length < Math.min(targets[gi], maxG)) {
            if (put(gi, que[0])) que.shift(); else break
          }
        }
      }
      fillRest(males); fillRest(females); fillRest(others) // others는 규칙상 대부분 불가지만 시도

    } else if (mode === '성비균형') {
      const totalPool = males.length + females.length + others.length
      const maleRatio = totalPool ? males.length / totalPool : 0.5
      const seats = targets.reduce((a,b)=>a+b,0)
      const maleTargets = hamiltonRound(targets.map(t => t * maleRatio), Math.min(males.length, seats))
      const counts = nextGroups.map(g => ({
        m: g.students.filter(s => s.gender === '남').length,
        f: g.students.filter(s => s.gender === '여').length,
        o: g.students.filter(s => s.gender === '미정').length,
      }))
      for (const gi of order) {
        while (canPut(gi) && males.length && counts[gi].m < maleTargets[gi]) {
          if (put(gi, males[0])) { males.shift(); counts[gi].m++ } else break
        }
      }
      for (const gi of order) {
        while (canPut(gi) && (females.length || others.length)) {
          const st = females.length ? females[0] : others[0]
          if (put(gi, st)) { if (st.gender==='여') females.shift(); else others.shift() } else break
        }
      }
      const rest = [...males, ...females, ...others]
      for (const gi of order) {
        while (rest.length && nextGroups[gi].students.length < Math.min(targets[gi], maxG)) {
          const st = rest[0]
          if (put(gi, st)) rest.shift(); else break
        }
      }
    } else {
      let all = shuffleArray([...males, ...females, ...others])
      for (const gi of order) {
        while (nextGroups[gi].students.length < Math.min(targets[gi], maxG) && all.length) {
          const st = all[0]
          if (put(gi, st)) all.shift(); else break
        }
      }
      let again = true
      while (again) {
        again = false
        for (const gi of order) {
          if (!all.length) break
          if (nextGroups[gi].students.length < Math.min(targets[gi], maxG)) {
            const st = all[0]
            if (put(gi, st)) { all.shift(); again = true }
          }
        }
      }
    }

    setGroups(nextGroups)
  }

  // 저장/불러오기/내보내기/인쇄
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
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 grid place-items-center">
              <Users className="w-5 h-5 text-blue-700" />
            </div>
            <h1 className="text-[1.05rem] font-semibold tracking-tight text-slate-800">자리배치 · 모둠편성</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 print:p-0">
        <div className="grid grid-cols-12 gap-5">
          {/* 좌측 패널 */}
          <aside className="col-span-12 lg:col-span-4 print:hidden">
            <div className="sticky top-[68px] space-y-4">
              {/* 편성 옵션 */}
              <section className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><span className="chip chip-blue"></span><h2 className="section-title">편성 옵션</h2></div>
                  <span className="badge">{mode === '남여섞기OFF' ? '남/여 분리' : '혼합 허용'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[.9rem]">
                  <label className="form-label">모둠 수
                    <input type="number" min={2} max={8} value={groupCount} onChange={(e)=>setGroupCount(Math.min(8, Math.max(2, parseInt(e.target.value || '4'))))} className="input input-sm" />
                  </label>
                  <label className="form-label">최소 인원
                    <input type="number" min={2} max={8} value={minPerGroup} onChange={(e)=>{ const v = Math.max(2, Math.min(8, parseInt(e.target.value || '3'))); setMinPerGroup(v); if (maxPerGroup < v) setMaxPerGroup(v) }} className="input input-sm" />
                  </label>
                  <label className="form-label">인원 상한
                    <input type="number" min={Math.max(3, minPerGroup)} max={8} value={maxPerGroup} onChange={(e)=>{ const v = Math.max(minPerGroup, Math.min(8, parseInt(e.target.value || String(minPerGroup)))); setMaxPerGroup(v) }} className="input input-sm" />
                  </label>
                  <label className="form-label col-span-2">편성 방법
                    <select value={mode} onChange={(e)=>setMode(e.target.value as Mode)} className="input input-sm">
                      <option value="성비균형">성비 균형 (남녀 섞음)</option>
                      <option value="완전랜덤">완전 랜덤 (섞음)</option>
                      <option value="남여섞기OFF">남/여 섞지 않기</option>
                    </select>
                  </label>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                  <div>총 <b>{students.length}</b> · 수용 <b>{groupCount * maxPerGroup}</b></div>
                  <div className={(groupCount * maxPerGroup) < students.length ? 'text-red-600' : 'text-slate-600'}>{capacityNote}</div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={arrange} className="btn-primary btn-sm"><Shuffle className="icon-left" />자동 편성</button>
                  <button onClick={clearAll} className="btn-ghost btn-sm"><Trash2 className="icon-left" />초기화</button>
                </div>
              </section>

              {/* 제약 */}
              <section className="card p-4">
                <div className="flex items-center gap-2 mb-2"><span className="chip chip-purple"></span><h2 className="section-title">제약 (친구/떼기)</h2></div>

                <div className="mb-2">
                  <div className="text-[.82rem] font-semibold text-slate-700 mb-1">친구(같이 배치)</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="input input-sm" value={selA} onChange={(e)=>setSelA(e.target.value)}><option value="">학생 A</option>{students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}</select>
                    <select className="input input-sm" value={selB} onChange={(e)=>setSelB(e.target.value)}><option value="">학생 B</option>{students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}</select>
                  </div>
                  <button className="btn btn-xs" onClick={()=>{
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
                    {!friendPairs.length && <span className="text-xs text-slate-400">친구 제약 없음</span>}
                  </div>
                </div>

                <hr className="my-3 border-slate-200" />

                <div>
                  <div className="text-[.82rem] font-semibold text-slate-700 mb-1">떼기(같은 모둠 금지)</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="input input-sm" value={selA2} onChange={(e)=>setSelA2(e.target.value)}><option value="">학생 A</option>{students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}</select>
                    <select className="input input-sm" value={selB2} onChange={(e)=>setSelB2(e.target.value)}><option value="">학생 B</option>{students.map(s=> <option key={s.id} value={s.id}>{s.name || '(이름)'}</option>)}</select>
                  </div>
                  <button className="btn btn-xs" onClick={()=>{
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
                    {!antiPairs.length && <span className="text-xs text-slate-400">떼기 제약 없음</span>}
                  </div>
                </div>
              </section>

              {/* 데이터 & 출력 – 초소형 3×2 */}
              <section className="card p-4 text-[.8rem]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="chip chip-emerald"></span>
                  <h2 className="section-title text-[.9rem]">데이터 & 출력</h2>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button onClick={saveAs} className="btn btn-xxs"><Save className="icon-left icon-xs" />저장</button>
                  <button onClick={loadFrom} className="btn btn-xxs"><Upload className="icon-left icon-xs" />불러오기</button>
                  <button onClick={exportCSV} className="btn btn-xxs"><Download className="icon-left icon-xs" />CSV</button>
                  <button onClick={exportJSON} className="btn btn-xxs"><Download className="icon-left icon-xs" />JSON</button>
                  <label className="btn btn-xxs cursor-pointer">
                    <Import className="icon-left icon-xs" />JSON
                    <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importJSON}/>
                  </label>
                  <button onClick={()=>window.print()} className="btn btn-xxs"><Printer className="icon-left icon-xs" />인쇄</button>
                </div>
              </section>
            </div>
          </aside>

          {/* 우측: 학생 목록 + 모둠 카드 */}
          <section className="col-span-12 lg:col-span-8">
            {/* 학생 목록 */}
            <section className="card p-4 mb-5 print:hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span className="chip chip-amber"></span><h2 className="section-title">학생 목록</h2></div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={filterUnplaced} onChange={(e)=>setFilterUnplaced(e.target.checked)} />
                    미배치만
                  </label>
                  <button onClick={addRow} className="btn btn-xs"><Plus className="icon-left" />추가</button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-2 mb-2">
                <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder={"여러 줄 붙여넣기 예)\n김철수/남\n이영희/여\n박민수 남"} className="input input-sm md:col-span-2 h-20" />
                <button onClick={applyBulk} className="btn-accent btn-xs">붙여넣기 추가</button>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-[0.88rem]">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="text-left text-slate-600">
                        <th className="p-2" style={{width:'2.2em'}}>#</th>
                        <th className="p-2" style={{width:'12em'}}>이름</th>{/* ≈ 한글 6글자 */}
                        <th className="p-2" style={{width:'6.5em'}}>성별</th>
                        <th className="p-2">상태</th>
                        <th className="p-2" style={{width:'6.5em'}}>이동</th>
                        <th className="p-2" style={{width:'6.5em'}}></th>
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
                              <input
                                value={s.name}
                                onChange={(e)=>setStudents(prev=>prev.map(x=>x.id===s.id?{...x, name:e.target.value}:x))}
                                className="input input-sm truncate"
                                style={{width:'12em'}} // 한글 6글자 정도
                                placeholder="이름"
                              />
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
                              <select className="input input-sm" defaultValue="" onChange={(e) => { const v = parseInt(e.target.value); if (!Number.isNaN(v)) assignToGroup(s.id, v - 1); e.currentTarget.value = '' }}>
                                <option value="">모둠</option>
                                {groups.map((g, idx) => (<option key={g.id} value={idx + 1} disabled={g.students.length >= maxPerGroup}>{idx + 1}</option>))}
                              </select>
                            </td>
                            <td className="p-2 text-right">
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">{s.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}</button>
                              <button onClick={()=>removeStudent(s.id)} className="icon-btn text-rose-600" title="삭제"><Trash2 className="w-4 h-4"/></button>
                              <button draggable onDragStart={startDrag(s.id)} className="icon-btn" title="드래그 이동">↔︎</button>
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
              <div className="flex items-center justify-between mb-2">
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
                      className={`min-h-[110px] grid grid-cols-1 gap-2 p-2 rounded-xl border-2 ${g.students.length<maxPerGroup?'border-dashed border-slate-300':'border-slate-200'}`}>
                      {g.students.map((s) => (
                        <motion.div key={s.id} layout className={`rounded-xl border bg-white shadow-sm ${s.locked ? 'ring-2 ring-amber-400' : ''}`}>
                          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl" draggable onDragStart={startDrag(s.id)} title="드래그하여 다른 모둠으로 이동">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${s.gender==='남' ? 'bg-blue-100 text-blue-700' : s.gender==='여' ? 'bg-pink-100 text-pink-700' : 'bg-slate-100 text-slate-700'}`}>{s.gender}</span>
                              <span className="font-medium text-slate-800 text-[.95rem]">{s.name || '(이름)'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <select className="input input-xxs" defaultValue="" onChange={(e) => { const v = parseInt(e.target.value); if (!Number.isNaN(v)) assignToGroup(s.id, v - 1); e.currentTarget.value = '' }} title="번호 선택으로 다른 모둠으로 이동">
                                <option value="">#</option>
                                {groups.map((gg, idx) => (<option key={gg.id} value={idx + 1} disabled={gg.students.length >= maxPerGroup || idx===gi}>{idx + 1}</option>))}
                              </select>
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">{s.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}</button>
                              <button onClick={()=>moveOut(s.id)} className="icon-btn text-slate-600" title="미배치로 이동">↩︎</button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {g.students.length===0 && (<div className="text-center text-slate-400 text-sm py-5">여기로 드래그하여 추가</div>)}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-5 text-center text-xs text-slate-500 print:hidden">인쇄 시 컨트롤·학생목록은 숨기고 모둠 카드만 출력합니다.</div>
            </section>
          </section>
        </div>

        {/* 스타일 */}
        <style>{`
          :root{ --blue:#2563eb; --emerald:#10b981; --purple:#7c3aed; --amber:#f59e0b; --indigo:#4f46e5; }
          .btn{ display:inline-flex; align-items:center; gap:.45rem; padding:.55rem .85rem; border-radius:.8rem; border:1px solid rgb(226,232,240); background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.05); font-weight:600; font-size:.93rem; color:#0f172a; }
          .btn-sm{ padding:.45rem .7rem; font-size:.9rem; border-radius:.7rem; }
          .btn-xs{ padding:.3rem .5rem; font-size:.78rem; border-radius:.6rem; }
          .btn-xxs{ padding:.25rem .45rem; font-size:.72rem; border-radius:.5rem; }
          .btn-primary{ display:inline-flex; align-items:center; gap:.45rem; padding:.6rem .95rem; border-radius:.9rem; background:var(--blue); color:#fff; font-weight:700; }
          .btn-ghost{ display:inline-flex; align-items:center; gap:.45rem; padding:.55rem .85rem; border-radius:.9rem; color:#334155; background:transparent; border:1px solid rgba(148,163,184,.35); }
          .btn-accent{ display:inline-flex; align-items:center; justify-content:center; gap:.45rem; padding:.55rem .85rem; border-radius:1rem; font-weight:800; background:linear-gradient(135deg,#34d399,#10b981); color:white; border:1px solid #a7f3d0; box-shadow:0 6px 14px -6px rgba(16,185,129,.4); }
          .icon-left{ width:.95rem; height:.95rem; margin-right:.05rem; }
          .icon-xs{ width:.85rem; height:.85rem; }
          .input{ width:100%; padding:.48rem .68rem; border:1px solid rgb(226,232,240); border-radius:.7rem; background:#fff; }
          .input-sm{ padding:.38rem .55rem; border-radius:.6rem; font-size:.9rem; }
          .input-xxs{ width:auto; padding:.18rem .32rem; border:1px solid rgb(226,232,240); border-radius:.5rem; background:#fff; font-size:.72rem; }
          .form-label{ font-size:.9rem; color:#334155; display:flex; flex-direction:column; gap:.25rem; }
          .card{ background:#fff; border:1px solid rgb(226,232,240); border-radius:1rem; box-shadow:0 1px 2px rgba(0,0,0,.05); }
          .icon-btn{ width:1.6rem; height:1.6rem; border-radius:9999px; display:inline-flex; align-items:center; justify-content:center; }
          .section-title{ font-size:1rem; font-weight:700; color:#0f172a; }
          .badge{ font-size:.68rem; padding:.12rem .45rem; border-radius:.5rem; background:#eef2ff; color:#4338ca; border:1px solid #e0e7ff; }
          .chip{ width:.52rem; height:.52rem; border-radius:9999px; display:inline-block; }
          .chip-blue{ background:linear-gradient(135deg,#dbeafe,#93c5fd); border:1px solid #bfdbfe; }
          .chip-emerald{ background:linear-gradient(135deg,#d1fae5,#86efac); border:1px solid #a7f3d0; }
          .chip-purple{ background:linear-gradient(135deg,#ede9fe,#c4b5fd); border:1px solid #ddd6fe; }
          .chip-amber{ background:linear-gradient(135deg,#fef3c7,#fcd34d); border:1px solid #fde68a; }
          .tag{ display:inline-flex; align-items:center; gap:.2rem; padding:.18rem .45rem; border-radius:.55rem; font-size:.78rem; border:1px solid rgb(226,232,240); }
          .tag-emerald{ background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
          .tag-rose{ background:#fff1f2; color:#9f1239; border-color:#fecdd3; }
          @media print {
            header, .print\\:hidden { display:none !important; }
            body { background:white !important; }
            .card { box-shadow:none !important; border:none !important; }
            .btn, .btn-primary, .btn-ghost, .btn-accent, .btn-sm, .btn-xs, .btn-xxs,
            .input, .input-xxs, .input-sm, textarea, select, label { display:none !important; }
          }
        `}</style>
      </main>
    </div>
  )
}
