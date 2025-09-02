// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Trash2, Shuffle, Save, Download, Upload, Printer,
  Lock, Unlock, Users, X
} from 'lucide-react'

type Gender = '남' | '여' | '미정'
type Student = { id: string; name: string; gender: Gender; locked?: boolean }
type Group = { id: string; name: string; students: Student[] }
type Mode = '성비균형' | '완전랜덤' | '남여섞기OFF'

const gid = () => Math.random().toString(36).slice(2, 9)
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)

export default function App() {
  const [students,setStudents]=useState<Student[]>([])
  const [groups,setGroups]=useState<Group[]>(Array.from({length:4},(_,i)=>({id:gid(), name:`${i+1}모둠`, students:[]})))
  const [groupCount,setGroupCount]=useState(4)
  const [minPerGroup,setMinPerGroup]=useState(3)
  const [maxPerGroup,setMaxPerGroup]=useState(4)
  const [mode,setMode]=useState<Mode>('성비균형')

  const placedIds=useMemo(()=>new Set(groups.flatMap(g=>g.students.map(s=>s.id))),[groups])

  /** 자동 편성 */
  function arrange() {
    const gc = groupCount
    const all = [...students, ...groups.flatMap(g=>g.students.filter(s=>!s.locked))]

    // 잠금된 학생 유지
    const lockedGroups = groups.map(g=>({...g}))
    lockedGroups.forEach(g => { g.students = g.students.filter(s=>s.locked) })

    // 미배치 풀
    let pool = shuffle(all.filter(s=>!s.locked))

    // 성별 분리
    let males = pool.filter(s=>s.gender==='남')
    let females = pool.filter(s=>s.gender==='여')
    let others = pool.filter(s=>s.gender==='미정')

    const nextGroups:Group[] = lockedGroups.map((g,i)=>({...g, name:`${i+1}모둠`}))
    const targets = Array(gc).fill(0).map(()=>minPerGroup)

    // 1단계: 최소 인원 배정
    for(let gi=0; gi<gc; gi++){
      while(nextGroups[gi].students.length < minPerGroup && pool.length){
        const st = pool.shift()!
        nextGroups[gi].students.push(st)
      }
    }

    // 2단계: 남는 인원 균등 분배
    let gi=0
    while(pool.length){
      if(nextGroups[gi].students.length < maxPerGroup){
        const st = pool.shift()!
        // 남여 분리 모드
        if(mode==='남여섞기OFF'){
          const ggen=new Set(nextGroups[gi].students.map(s=>s.gender))
          if(ggen.size>1 && st.gender!=='미정'){ pool.push(st); gi=(gi+1)%gc; continue }
        }
        nextGroups[gi].students.push(st)
      }
      gi=(gi+1)%gc
      // 모든 그룹 꽉 차면 중단
      if(nextGroups.every(g=>g.students.length>=maxPerGroup)) break
    }

    // 3단계: 성비 균형 모드 (라운드로빈, 남여 교차)
    if(mode==='성비균형'){
      // 이미 채워진 그룹 다시 섞음
      const flat=[...males,...females,...others]
      gi=0
      while(flat.length){
        if(nextGroups[gi].students.length < maxPerGroup){
          nextGroups[gi].students.push(flat.shift()!)
        } else flat.shift()
        gi=(gi+1)%gc
      }
    }

    setGroups(nextGroups)
    setStudents([]) // 미배치 없애고 그룹에 채움
  }

  return (
    <div className="p-4">
      <h1 className="font-bold text-lg mb-2">자리배치 · 모둠편성</h1>
      <div className="flex gap-2 mb-3">
        <input type="number" value={groupCount} min={2} max={8}
          onChange={e=>setGroupCount(parseInt(e.target.value)||2)}
          className="border px-2 w-20"/>
        <input type="number" value={minPerGroup} min={2} max={8}
          onChange={e=>setMinPerGroup(parseInt(e.target.value)||2)}
          className="border px-2 w-20"/>
        <input type="number" value={maxPerGroup} min={minPerGroup} max={8}
          onChange={e=>setMaxPerGroup(parseInt(e.target.value)||4)}
          className="border px-2 w-20"/>
        <select value={mode} onChange={e=>setMode(e.target.value as Mode)} className="border px-2">
          <option value="성비균형">성비 균형</option>
          <option value="완전랜덤">완전 랜덤</option>
          <option value="남여섞기OFF">남/여 분리</option>
        </select>
        <button onClick={arrange} className="bg-blue-500 text-white px-4 py-1 rounded">자동 편성</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {groups.map((g,i)=>(
          <div key={g.id} className="border rounded p-2">
            <h2 className="font-semibold mb-1">{g.name} ({g.students.length}/{maxPerGroup})</h2>
            <div className="space-y-1">
              {g.students.map(s=>(
                <div key={s.id} className="flex items-center justify-between border px-2 py-1 rounded">
                  <span>{s.gender} {s.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
