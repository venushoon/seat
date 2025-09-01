import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Trash2, Shuffle, Save, Download, Upload, Printer,
  Lock, Unlock, Users, Settings2, Import
} from 'lucide-react'
import type { Group, Student, Gender, Mode } from './lib/types'

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
  const [groupCount, setGroupCount] = useState<number>(4)     // 2~8
  const [groupSize, setGroupSize] = useState<number>(4)       // 3~8
  const [mode, setMode] = useState<Mode>('성비균형')
  const [mixGender, setMixGender] = useState<boolean>(true)
  const [filterUnplaced, setFilterUnplaced] = useState<boolean>(false)
  const [bulk, setBulk] = useState<string>('')

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
        setGroupCount(parsed.groupCount || 4)
        setGroupSize(parsed.groupSize || 4)
        setMode(parsed.mode || '성비균형')
        setMixGender(parsed.mixGender ?? true)
      } catch {}
    }
  }, [])
  useEffect(() => {
    const payload = { students, groups, groupCount, groupSize, mode, mixGender }
    localStorage.setItem('seat-arranger:auto', JSON.stringify(payload))
  }, [students, groups, groupCount, groupSize, mode, mixGender])

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

  const placedIds = useMemo(
    () => new Set(groups.flatMap((g) => g.students.map((s) => s.id))),
    [groups]
  )
  const capacity = groupCount * groupSize
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
      if (clone[gidx].students.length >= groupSize) return clone
      clone[gidx] = { ...clone[gidx], students: [...clone[gidx].students, moved!] }
      return clone
    })
    dragId.current = null
  }

  // 순환 제너레이터
  function* cycle(arr: number[]) {
    let k = 0
    while (true) yield arr[k++ % arr.length]
  }

  // 편성 알고리즘
  function arrange() {
    const lockedIds = new Set<string>()
    const pool: Student[] = []
    const nextGroups: Group[] = groups.map((g) => ({
      ...g,
      students: g.students.filter((s) => {
        if (s.locked) {
          lockedIds.add(s.id)
          return true
        } else {
          pool.push(s)
          return false
        }
      })
    }))
    students.forEach((s) => {
      if (!lockedIds.has(s.id) && !placedIds.has(s.id)) pool.push(s)
    })

    let males = shuffleArray(pool.filter((s) => s.gender === '남'))
    let females = shuffleArray(pool.filter((s) => s.gender === '여'))
    let others = shuffleArray(pool.filter((s) => s.gender === '미정'))

    const put = (idx: number, st: Student) => {
      if (nextGroups[idx].students.length < groupSize) {
        nextGroups[idx] = {
          ...nextGroups[idx],
          students: [...nextGroups[idx].students, st]
        }
        return true
      }
      return false
    }
    const order = shuffleArray(Array.from({ length: groupCount }, (_, i) => i))

    if (!mixGender || mode === '완전랜덤') {
      let all = shuffleArray([...males, ...females, ...others])
      outer: for (let idx of cycle(order)) {
        while (nextGroups[idx].students.length < groupSize && all.length) {
          const st = all.shift()!
          put(idx, st)
          if (!all.length) break outer
        }
      }
    } else if (mode === '성비균형') {
      const totalPool = males.length + females.length + others.length
      const maleRatio = totalPool ? males.length / totalPool : 0.5
      const targetMale = Array.from({ length: groupCount }, () =>
        Math.round(groupSize * maleRatio)
      )
      const targetFemale = Array.from({ length: groupCount }, () =>
        groupSize - Math.round(groupSize * maleRatio)
      )
      const counts = nextGroups.map((g) => ({
        m: g.students.filter((s) => s.gender === '남').length,
        f: g.students.filter((s) => s.gender === '여').length,
        o: g.students.filter((s) => s.gender === '미정').length
      }))
      outer2: for (let idx of cycle(order)) {
        while (nextGroups[idx].students.length < groupSize) {
          let chosen: Student | undefined
          if (males.length && counts[idx].m < targetMale[idx]) {
            chosen = males.shift(); counts[idx].m++
          } else if (females.length && counts[idx].f < targetFemale[idx]) {
            chosen = females.shift(); counts[idx].f++
          } else if (others.length) {
            chosen = others.shift(); counts[idx].o++
          } else if (males.length) {
            chosen = males.shift(); counts[idx].m++
          } else if (females.length) {
            chosen = females.shift(); counts[idx].f++
          } else break outer2
          put(idx, chosen!)
        }
      }
    }
    setGroups(nextGroups)
  }

  // 저장/불러오기/내보내기
  function saveAs() {
    const name = prompt('저장 이름을 입력하세요 (예: 2학기-6학년-1반)')
    if (!name) return
    const saves = JSON.parse(localStorage.getItem('seat-arranger:saves') || '{}')
    saves[name] = {
      students, groups, groupCount, groupSize, mode, mixGender,
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
    setGroupCount(s.groupCount || 4)
    setGroupSize(s.groupSize || 4)
    setMode(s.mode || '성비균형')
    setMixGender(s.mixGender ?? true)
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
    const data = { students, groups, groupCount, groupSize, mode, mixGender }
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
        setGroupCount(obj.groupCount || 4)
        setGroupSize(obj.groupSize || 4)
        setMode(obj.mode || '성비균형')
        setMixGender(obj.mixGender ?? true)
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
          {/* ===== 왼쪽 사이드바 (옵션 + 파일/출력) ===== */}
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

                  <label className="form-label">모둠 인원
                    <input
                      type="number" min={3} max={8} value={groupSize}
                      onChange={(e)=>setGroupSize(Math.min(8, Math.max(3, parseInt(e.target.value || '4'))))}
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
                  <div>총 학생 <b>{students.length}</b> · 수용 <b>{groupCount * groupSize}</b></div>
                  <div className={(groupCount * groupSize) < students.length ? 'text-red-600' : 'text-slate-600'}>{capacityNote}</div>
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
                  <span className="chip chip-purple"></span>
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
                  <span className="chip chip-amber"></span>
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
                      <span className="text-xs text-slate-500">{g.students.length}/{groupSize}</span>
                    </div>

                    <div
                      onDragOver={(e)=>e.preventDefault()}
                      onDrop={onDropToGroup(gi)}
                      className={`min-h-[120px] grid grid-cols-1 gap-2 p-2 rounded-xl border-2 ${g.students.length<groupSize?'border-dashed border-slate-300':'border-slate-200'}`}
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

        {/* 전역/강조 스타일 (타이포 & 버튼 크기/색상) */}
        <style>{`
          :root{
            --blue:#2563eb; --blue-ink:#1d4ed8;
            --emerald:#10b981; --purple:#7c3aed; --amber:#f59e0b;
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

          @media print {
            header, .print\\:hidden { display:none !important; }
            body { background:white !important; }
            .card { box-shadow:none !important; border:none !important; }
            .btn, .btn-primary, .btn-ghost, .input, textarea { display:none !important; }
          }
        `}</style>
      </main>
    </div>
  )
}
