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
type Pair = { aId: string; bId: string }

const gid = () => Math.random().toString(36).slice(2, 9)
const shuffleArray = <T,>(arr: T[]) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a }

// 붙여넣기/CSV 파서
const parseBulk = (text:string):Student[] =>
  text.split(/\n|,/).map(s=>s.trim()).filter(Boolean).map(line=>{
    const m=line.match(/([^/\s,|]+)[/\s,|]*(남|여)?/)
    const name=m?.[1]||line
    const gender=(m?.[2] as Gender)||'미정'
    return { id: gid(), name, gender, locked:false }
  })
function parseCSV(text:string):Student[] {
  const clean=text.replace(/^\uFEFF/,'')
  const rows=clean.split(/\r?\n/).map(r=>r.trim()).filter(Boolean)
  if(!rows.length) return []
  const split=(r:string)=>r.split(',').map(s=>s.trim())
  let header:string[]|null=null
  const out:Student[]=[]
  for(let i=0;i<rows.length;i++){
    const c=split(rows[i])
    if(i===0 && /^(이름|name)$/i.test(c[0]||'')){ header=c; continue }
    const get=(k:RegExp, d:number)=> header? c[header.findIndex(h=>k.test(h))]??'' : c[d]??''
    const name=(get(/^(이름|name)$/i,0)||'').trim()
    const raw=(get(/^(성별|gender)$/i,1)||'').trim().toLowerCase()
    if(!name) continue
    let gender:Gender='미정'
    if(['남','남자','m','male','boy'].some(t=>raw.includes(t))) gender='남'
    else if(['여','여자','f','female','girl'].some(t=>raw.includes(t))) gender='여'
    out.push({ id: gid(), name, gender, locked:false })
  }
  return out
}
function hamiltonRound(values:number[], total:number){
  const floors=values.map(Math.floor)
  let sum=floors.reduce((a,b)=>a+b,0)
  const order=values.map((v,i)=>({i, frac:v-Math.floor(v)})).sort((a,b)=>b.frac-a.frac)
  const out=[...floors]
  let k=0
  while(sum<total && k<order.length){ out[order[k].i]++; sum++; k++ }
  return out
}

export default function App(){
  const [students,setStudents]=useState<Student[]>([])
  const [groups,setGroups]=useState<Group[]>(Array.from({length:4},(_,i)=>({id:gid(), name:`${i+1}모둠`, students:[]})))
  const [groupCount,setGroupCount]=useState(4)
  const [minPerGroup,setMinPerGroup]=useState(3)
  const [maxPerGroup,setMaxPerGroup]=useState(4)
  const [mode,setMode]=useState<Mode>('성비균형')
  const [filterUnplaced,setFilterUnplaced]=useState(false)
  const [bulk,setBulk]=useState('')

  const [friendPairs,setFriendPairs]=useState<Pair[]>([])
  const [antiPairs,setAntiPairs]=useState<Pair[]>([])
  const [selA,setSelA]=useState(''),[selB,setSelB]=useState('')
  const [selA2,setSelA2]=useState(''),[selB2,setSelB2]=useState('')

  const jsonInputRef=useRef<HTMLInputElement>(null)
  const csvInputRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{ const saved=localStorage.getItem('seat-arranger:auto'); if(saved){ try{
    const p=JSON.parse(saved)
    setStudents(p.students||[]); setGroups(p.groups||[])
    setGroupCount(p.groupCount??4); setMinPerGroup(p.minPerGroup??3); setMaxPerGroup(p.maxPerGroup??4)
    setMode(p.mode||'성비균형'); setFriendPairs(p.friendPairs||[]); setAntiPairs(p.antiPairs||[])
  }catch{}}},[])
  useEffect(()=>{ const payload={students,groups,groupCount,minPerGroup,maxPerGroup,mode,friendPairs,antiPairs}; localStorage.setItem('seat-arranger:auto', JSON.stringify(payload))},[students,groups,groupCount,minPerGroup,maxPerGroup,mode,friendPairs,antiPairs])

  useEffect(()=>{ setGroups(prev=>{
    const arr=[...prev]
    if(groupCount>prev.length){
      for(let i=prev.length;i<groupCount;i++) arr.push({id:gid(), name:`${i+1}모둠`, students:[]})
    }else if(groupCount<prev.length){
      const removed=arr.splice(groupCount)
      const back=removed.flatMap(g=>g.students)
      if(back.length) setStudents(s=>dedupeById([...s, ...back.map(st=>({...st,locked:false}))]))
    }
    return arr.map((g,i)=>({...g,name:`${i+1}모둠`}))
  })},[groupCount])

  const placedIds=useMemo(()=>new Set(groups.flatMap(g=>g.students.map(s=>s.id))),[groups])
  const capacity=groupCount*maxPerGroup
  const total=students.length
  const capacityNote=capacity<total?`⚠️ 자리(${capacity}) < 학생(${total})`:capacity>total?`남는 자리: ${capacity-total}`:'정확히 맞음'
  const findGroupIdxOf=(id:string)=>groups.findIndex(g=>g.students.some(s=>s.id===id))
  const groupNameOf=(id:string)=> (findGroupIdxOf(id)>=0? groups[findGroupIdxOf(id)].name : '')
  const nameOf=(id:string)=>students.find(s=>s.id===id)?.name||groups.flatMap(g=>g.students).find(s=>s.id===id)?.name||'(이름)'

  const dedupeById = (arr:Student[]) => {
    const seen = new Set<string>()
    const out:Student[]=[]
    for(const s of arr){
      if(seen.has(s.id)) continue
      seen.add(s.id); out.push(s)
    }
    return out
  }
  const addRow=()=>setStudents(s=>[...s,{id:gid(),name:'',gender:'미정',locked:false}])
  const clearAll=()=>{ 
    if(!confirm('모든 모둠 배치를 해제하고 학생들을 미배치 목록으로 되돌립니다.')) return
    const back = groups.flatMap(g=>g.students).map(st=>({...st, locked:false}))
    setStudents(prev=>dedupeById([...prev, ...back]))
    setGroups(gs=>gs.map(g=>({...g,students:[]})))
  }
  const removeStudent=(id:string)=>{ 
    setStudents(s=>s.filter(x=>x.id!==id))
    setGroups(gs=>gs.map(g=>({...g,students:g.students.filter(x=>x.id!==id)})))
  }
  const toggleLock=(id:string)=>{ 
    setStudents(s=>s.map(x=>x.id===id?{...x,locked:!x.locked}:x))
    setGroups(gs=>gs.map(g=>({...g,students:g.students.map(x=>x.id===id?{...x,locked:!x.locked}:x)})))
  }
  const moveOut=(id:string)=>{ 
    let moved:Student|null=null
    setGroups(prev=>prev.map(g=>({...g,students:g.students.filter(s=>{ if(s.id===id){moved=s; return false} return true })})))
    if(moved) setStudents(s=>dedupeById([...s,{...moved!,locked:false}]))
  }
  const applyBulk=()=>{ const parsed=parseBulk(bulk); if(!parsed.length) return; setStudents(s=>[...s,...parsed]); setBulk('') }

  const groupGenderOf=(g:Group):Gender|'혼합'|'비어있음'=>{
    if(!g.students.length) return '비어있음'
    const set=new Set(g.students.map(s=>s.gender))
    if(set.has('남')&&set.has('여')) return '혼합'
    if(set.has('남')) return '남'
    if(set.has('여')) return '여'
    return '비어있음'
  }
  const canAddTo=(g:Group, st:Student)=>{
    if(g.students.length>=maxPerGroup) return false
    if(mode!=='남여섞기OFF') return true
    if(st.gender==='미정') return false
    const gg=groupGenderOf(g)
    if(gg==='비어있음') return true
    if(gg==='혼합') return false
    return gg===st.gender
  }
  const hasAntiWith = (g:Group, st:Student) =>
    g.students.some(s=> antiPairs.some(p=>(p.aId===s.id&&p.bId===st.id)||(p.aId===st.id&&p.bId===s.id)))

  function assignToGroup(stuId:string, gidx:number){
    const st = students.find(s=>s.id===stuId) || groups.flatMap(g=>g.students).find(s=>s.id===stuId)
    if(!st) return false
    const inStudents=students.some(s=>s.id===stuId)
    let added=false
    setGroups(prev=>{
      if(gidx<0||gidx>=prev.length) return prev
      let from=-1
      const stripped=prev.map((g,i)=>{ const exists=g.students.some(s=>s.id===stuId); if(exists) from=i; return {...g,students:g.students.filter(s=>s.id!==stuId)} })
      if(from===gidx) return prev
      const target=stripped[gidx]
      if(!canAddTo(target,st)) return prev
      if(hasAntiWith(target,st)) return prev
      if(target.students.length>=maxPerGroup) return prev
      stripped[gidx]={...target,students:[...target.students,st]}
      added=true
      return stripped
    })
    if(inStudents && added) setStudents(ss=>ss.filter(x=>x.id!==stuId))
    return added
  }

  const startDrag=(id:string)=>(e:React.DragEvent)=>{ e.dataTransfer.setData('text/plain',id) }
  const onDropToGroup=(gidx:number)=>(e:React.DragEvent)=>{ e.preventDefault(); const id=e.dataTransfer.getData('text/plain'); if(id) assignToGroup(id,gidx) }

  function arrange(){
    const gc=Math.max(2,Math.min(8,groupCount))
    const minG=Math.max(2,Math.min(8,minPerGroup))
    const maxG=Math.max(minG,Math.min(8,maxPerGroup))
    const totalPool = students.length + groups.flatMap(g=>g.students.filter(s=>!s.locked)).length
    if(totalPool<minG*gc){ alert(`학생 수가 부족합니다. 최소 ${gc}×${minG} = ${minG*gc}명 필요`); return }

    const pool:Student[]=[]
    const nextGroups:Group[]=groups.slice(0,gc).map(g=>({
      ...g,
      students:g.students.filter(s=>{ if(s.locked) return true; pool.push(s); return false })
    }))
    pool.push(...students)

    const lockedCounts=nextGroups.map(g=>g.students.length)
    const base=lockedCounts.map(c=>Math.max(minG,c))
    const cap=Array(gc).fill(maxG)
    const room=base.map((b,i)=>Math.max(0, cap[i]-b))
    let extrasLeft=Math.min(pool.length, room.reduce((a,b)=>a+b,0))
    const extras=Array(gc).fill(0)
    while(extrasLeft>0){
      let moved=false
      for(let i=0;i<gc && extrasLeft>0;i++){
        if(extras[i]<room[i]){ extras[i]++; extrasLeft--; moved=true }
      }
      if(!moved) break
    }
    const targets=base.map((b,i)=>Math.min(cap[i], b+extras[i]))

    const friendMap = new Map<string,string[]>()
    friendPairs.forEach(p=>{
      friendMap.set(p.aId,[...(friendMap.get(p.aId)||[]), p.bId])
      friendMap.set(p.bId,[...(friendMap.get(p.bId)||[]), p.aId])
    })

    let males=shuffleArray(pool.filter(s=>s.gender==='남'))
    let females=shuffleArray(pool.filter(s=>s.gender==='여'))
    let others=shuffleArray(pool.filter(s=>s.gender==='미정'))
    const order=shuffleArray(Array.from({length:gc},(_,i)=>i))
    const canPut=(i:number, st:Student)=> nextGroups[i].students.length<targets[i] && canAddTo(nextGroups[i], st) && !hasAntiWith(nextGroups[i], st)
    const put=(i:number, st:Student)=>{ if(!canPut(i,st)) return false; nextGroups[i]={...nextGroups[i],students:[...nextGroups[i].students,st]}; return true }

    const placed=new Set<string>()
    function placeWithFriend(st:Student){
      const frs=friendMap.get(st.id)||[]
      for(const gi of order){
        if(!canPut(gi,st)) continue
        const hasFriend = nextGroups[gi].students.some(x=>frs.includes(x.id))
        if(hasFriend) { put(gi,st); placed.add(st.id); return true }
      }
      return false
    }
    const tryPlaceRoundRobin=(arr:Student[])=>{
      let giIdx=0
      for(const st of arr){
        if(placed.has(st.id)) continue
        if(placeWithFriend(st)) continue
        let tried=0, placedOk=false
        while(tried<gc){
          const gi=order[(giIdx+tried)%gc]
          if(put(gi,st)){ placed.add(st.id); placedOk=true; giIdx=(giIdx+tried+1)%gc; break }
          tried++
        }
        if(!placedOk){ others.push(st) }
      }
    }

    if(mode==='남여섞기OFF'){
      const maleG:number[]=[], femaleG:number[]=[], empty:number[]=[]
      nextGroups.forEach((g,i)=>{ const gg=groupGenderOf(g); if(gg==='남') maleG.push(i); else if(gg==='여') femaleG.push(i); else if(gg==='비어있음') empty.push(i) })
      const needMale=Math.max(0, Math.floor(males.length/minG)-maleG.length)
      const maleTargets = maleG.concat(empty.slice(0,needMale)).slice(0,gc)
      const used=new Set(maleTargets)
      const femaleTargets = femaleG.concat(empty.filter(i=>!used.has(i)))

      const rr=(targetIdx:number[], arr:Student[])=>{
        let idx=0
        for(const st of arr){
          if(placed.has(st.id)) continue
          let tried=0, ok=false
          while(tried<targetIdx.length){
            const gi=targetIdx[(idx+tried)%targetIdx.length]
            if(put(gi,st)){ placed.add(st.id); idx=(idx+tried+1)%targetIdx.length; ok=true; break }
            tried++
          }
          if(!ok) others.push(st)
        }
      }
      rr(maleTargets, males)
      rr(femaleTargets, females)
      tryPlaceRoundRobin(others)
    } else if(mode==='성비균형'){
      const seats=targets.reduce((a,b)=>a+b,0) - nextGroups.reduce((a,g)=>a+g.students.length,0)
      const maleSeats=Math.round(seats * (males.length / Math.max(1,(males.length+females.length+others.length))))
      const maleGoalPerGroup=hamiltonRound(targets.map((t,i)=>Math.max(0,t-nextGroups[i].students.length)*(males.length/Math.max(1,(males.length+females.length+others.length)))), Math.min(maleSeats,males.length))
      for(const gi of order){ while(males.length && nextGroups[gi].students.filter(s=>s.gender==='남').length < maleGoalPerGroup[gi] && nextGroups[gi].students.length<targets[gi]){ const st=males.shift()!; if(put(gi,st)) placed.add(st.id); else males.unshift(st); break } }
      tryPlaceRoundRobin(males)
      tryPlaceRoundRobin(females)
      tryPlaceRoundRobin(others)
    } else {
      const all=shuffleArray([...males,...females,...others])
      tryPlaceRoundRobin(all)
    }

    const lockedCount = nextGroups.map(g => g.students.filter(s=>s.locked).length)
    let movedSomething = true, safety=0
    while (movedSomething && safety < 200) {
      safety++
      movedSomething = false
      const lackIdx = nextGroups
        .map((g,i)=>({ i, need: Math.max(0, targets[i] - g.students.length) }))
        .filter(x => x.need > 0)
        .sort((a,b)=>b.need-a.need)
      if (!lackIdx.length) break

      for (const { i:toIdx } of lackIdx) {
        const donors = nextGroups
          .map((g,j)=>({ j, spare: g.students.length - Math.max(minG, lockedCount[j]) }))
          .filter(d => d.j !== toIdx && d.spare > 0)
          .sort((a,b)=>b.spare-a.spare)

        let filled=false
        for (const { j:fromIdx } of donors) {
          const cand = [...nextGroups[fromIdx].students].reverse()
            .find(s => !s.locked && canAddTo(nextGroups[toIdx], s) && !hasAntiWith(nextGroups[toIdx], s))
          if (!cand) continue
          nextGroups[fromIdx]={...nextGroups[fromIdx], students: nextGroups[fromIdx].students.filter(s=>s.id!==cand.id)}
          if(nextGroups[toIdx].students.length<maxG){
            nextGroups[toIdx]={...nextGroups[toIdx], students:[...nextGroups[toIdx].students, cand]}
            movedSomething=true; filled=true; break
          }
        }
        if(!filled) continue
      }
    }

    const placedAfter=new Set(nextGroups.flatMap(g=>g.students.map(s=>s.id)))
    const remain = pool.filter(s=>!placedAfter.has(s.id) && !s.locked)
    setGroups(nextGroups)
    setStudents(remain)
  }

  function saveAs(){
    const name=prompt('저장 이름을 입력하세요 (예: 2학기-6학년-1반)'); if(!name) return
    const saves=JSON.parse(localStorage.getItem('seat-arranger:saves')||'{}')
    saves[name]={ students, groups, groupCount, minPerGroup, maxPerGroup, mode, friendPairs, antiPairs, savedAt:new Date().toISOString() }
    localStorage.setItem('seat-arranger:saves', JSON.stringify(saves))
    alert('저장되었습니다.')
  }
  function loadFrom(){
    const saves=JSON.parse(localStorage.getItem('seat-arranger:saves')||'{}')
    const keys=Object.keys(saves); if(!keys.length) return alert('저장된 항목이 없습니다.')
    const name=prompt(`불러올 이름을 입력하세요\n${keys.join('\n')}`); if(!name||!saves[name]) return
    const s=saves[name]
    setStudents(s.students||[]); setGroups(s.groups||[])
    setGroupCount(s.groupCount??4); setMinPerGroup(s.minPerGroup??3); setMaxPerGroup(s.maxPerGroup??4)
    setMode(s.mode||'성비균형'); setFriendPairs(s.friendPairs||[]); setAntiPairs(s.antiPairs||[])
  }
  function exportCSV(){
    const rows:string[]=[]
    groups.forEach(g=>{ rows.push(`${g.name}`); g.students.forEach((s,i)=>rows.push(`${i+1},${s.name},${s.gender}`)); rows.push('') })
    const csv=`번호,이름,성별\n`+rows.join('\n')
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='모둠편성.csv'; a.click(); URL.revokeObjectURL(url)
  }
  function exportJSON(){
    const data={students,groups,groupCount,minPerGroup,maxPerGroup,mode,friendPairs,antiPairs}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='seat-arranger.json'; a.click(); URL.revokeObjectURL(url)
  }
  function importJSON(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file) return
    const r=new FileReader()
    r.onload=()=>{ try{
      const obj=JSON.parse(String(r.result))
      setStudents(obj.students||[]); setGroups(obj.groups||[])
      setGroupCount(obj.groupCount??4); setMinPerGroup(obj.minPerGroup??3); setMaxPerGroup(obj.maxPerGroup??4)
      setMode(obj.mode||'성비균형'); setFriendPairs(obj.friendPairs||[]); setAntiPairs(obj.antiPairs||[])
    }catch{ alert('JSON 파싱 실패') } }
    r.readAsText(file); e.currentTarget.value=''
  }
  function importCSV(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file) return
    const r=new FileReader()
    r.onload=()=>{ try{
      const add=parseCSV(String(r.result||''))
      if(!add.length){ alert('CSV에서 학생을 찾지 못했습니다. (형식: 이름,성별)'); return }
      setStudents(prev=>[...prev,...add]); alert(`${add.length}명 추가`)
    }catch{ alert('CSV 파싱 실패') } }
    r.readAsText(file,'utf-8'); e.currentTarget.value=''
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white print:bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 grid place-items-center"><Users className="w-5 h-5 text-blue-700"/></div>
            <h1 className="text-[1.05rem] font-semibold tracking-tight text-slate-800">자리배치 · 모둠편성</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 print:p-0">
        <div className="grid grid-cols-12 gap-5">
          {/* 좌측 */}
          <aside className="col-span-12 lg:col-span-4 print:hidden">
            <div className="sticky top-[68px] space-y-4">
              {/* 옵션 */}
              <section className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><span className="chip chip-blue"></span><h2 className="section-title">편성 옵션</h2></div>
                  <span className="badge">{mode==='남여섞기OFF'?'남/여 분리':'혼합 허용'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[.9rem]">
                  <label className="form-label">모둠 수
                    <input type="number" min={2} max={8} value={groupCount} onChange={(e)=>setGroupCount(Math.min(8,Math.max(2,parseInt(e.target.value||'4'))))} className="input input-sm"/>
                  </label>
                  <label className="form-label">최소 인원
                    <input type="number" min={2} max={8} value={minPerGroup} onChange={(e)=>{const v=Math.max(2,Math.min(8,parseInt(e.target.value||'3'))); setMinPerGroup(v); if(maxPerGroup<v) setMaxPerGroup(v)}} className="input input-sm"/>
                  </label>
                  <label className="form-label">인원 상한
                    <input type="number" min={Math.max(3,minPerGroup)} max={8} value={maxPerGroup} onChange={(e)=>{const v=Math.max(minPerGroup,Math.min(8,parseInt(e.target.value||String(minPerGroup)))); setMaxPerGroup(v)}} className="input input-sm"/>
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
                  <div>총 <b>{students.length}</b> · 수용 <b>{groupCount*maxPerGroup}</b></div>
                  <div className={capacity<total?'text-red-600':'text-slate-600'}>{capacityNote}</div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={arrange} className="btn-primary btn-sm"><Shuffle className="icon-left"/>자동 편성</button>
                  <button onClick={clearAll} className="btn-ghost btn-sm"><Trash2 className="icon-left"/>초기화</button>
                </div>
              </section>

              {/* 제약 */}
              <section className="card p-4">
                <div className="flex items-center gap-2 mb-2"><span className="chip chip-purple"></span><h2 className="section-title">제약 (친구/떼기)</h2></div>

                {/* 친구: 셀렉트 2개 + 추가 버튼 (우측 배치) */}
                <div className="mb-2">
                  <div className="text-[.82rem] font-semibold text-slate-700 mb-1">친구(같이 배치)</div>
                  <div className="grid grid-cols-[1fr,1fr,auto] gap-2">
                    <select className="input input-sm" value={selA} onChange={(e)=>setSelA(e.target.value)}>
                      <option value="">학생 A</option>
                      {[...students, ...groups.flatMap(g=>g.students)].map(s=><option key={s.id} value={s.id}>{s.name||'(이름)'}</option>)}
                    </select>
                    <select className="input input-sm" value={selB} onChange={(e)=>setSelB(e.target.value)}>
                      <option value="">학생 B</option>
                      {[...students, ...groups.flatMap(g=>g.students)].map(s=><option key={s.id} value={s.id}>{s.name||'(이름)'}</option>)}
                    </select>
                    <button className="btn btn-xs whitespace-nowrap" onClick={()=>{
                      if(!selA||!selB||selA===selB) return
                      const exists=friendPairs.some(p=>(p.aId===selA&&p.bId===selB)||(p.aId===selB&&p.bId===selA))
                      const conflicted=antiPairs.some(p=>(p.aId===selA&&p.bId===selB)||(p.aId===selB&&p.bId===selA))
                      if(conflicted){ alert('이미 떼기 제약에 존재합니다.'); return }
                      if(!exists) setFriendPairs(ps=>[...ps,{aId:selA,bId:selB}]); setSelA(''); setSelB('')
                    }}>추가</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {friendPairs.map((p,i)=>(
                      <span key={`f-${i}`} className="tag tag-emerald">{nameOf(p.aId)} ↔ {nameOf(p.bId)}<button className="ml-1 inline-flex" onClick={()=>setFriendPairs(ps=>ps.filter((_,idx)=>idx!==i))}><X className="w-3 h-3"/></button></span>
                    ))}{!friendPairs.length && <span className="text-xs text-slate-400">친구 제약 없음</span>}
                  </div>
                </div>

                <hr className="my-3 border-slate-200"/>

                {/* 떼기: 셀렉트 2개 + 추가 버튼 (우측 배치) */}
                <div>
                  <div className="text-[.82rem] font-semibold text-slate-700 mb-1">떼기(같은 모둠 금지)</div>
                  <div className="grid grid-cols-[1fr,1fr,auto] gap-2">
                    <select className="input input-sm" value={selA2} onChange={(e)=>setSelA2(e.target.value)}>
                      <option value="">학생 A</option>
                      {[...students, ...groups.flatMap(g=>g.students)].map(s=><option key={s.id} value={s.id}>{s.name||'(이름)'}</option>)}
                    </select>
                    <select className="input input-sm" value={selB2} onChange={(e)=>setSelB2(e.target.value)}>
                      <option value="">학생 B</option>
                      {[...students, ...groups.flatMap(g=>g.students)].map(s=><option key={s.id} value={s.id}>{s.name||'(이름)'}</option>)}
                    </select>
                    <button className="btn btn-xs whitespace-nowrap" onClick={()=>{
                      if(!selA2||!selB2||selA2===selB2) return
                      const exists=antiPairs.some(p=>(p.aId===selA2&&p.bId===selB2)||(p.aId===selB2&&p.bId===selA2))
                      const conflicted=friendPairs.some(p=>(p.aId===selA2&&p.bId===selB2)||(p.aId===selB2&&p.bId===selA2))
                      if(conflicted){ alert('이미 친구 제약에 존재합니다.'); return }
                      if(!exists) setAntiPairs(ps=>[...ps,{aId:selA2,bId:selB2}]); setSelA2(''); setSelB2('')
                    }}>추가</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {antiPairs.map((p,i)=>(
                      <span key={`a-${i}`} className="tag tag-rose">{nameOf(p.aId)} ≠ {nameOf(p.bId)}<button className="ml-1 inline-flex" onClick={()=>setAntiPairs(ps=>ps.filter((_,idx)=>idx!==i))}><X className="w-3 h-3"/></button></span>
                    ))}{!antiPairs.length && <span className="text-xs text-slate-400">떼기 제약 없음</span>}
                  </div>
                </div>
              </section>

              {/* 데이터 & 출력 (아이콘 + 확장자 라벨) */}
              <section className="card p-4 text-[.8rem]">
                <div className="flex items-center gap-2 mb-2"><span className="chip chip-emerald"></span><h2 className="section-title text-[.9rem]">데이터 & 출력</h2></div>
                <div className="grid grid-cols-3 gap-1">
                  <button onClick={saveAs} className="btn btn-xxs" title="저장"><Save className="icon-left icon-xs"/>저장</button>
                  <button onClick={loadFrom} className="btn btn-xxs" title="저장 목록 불러오기"><Upload className="icon-left icon-xs"/>불러오기</button>
                  <button onClick={exportCSV} className="btn btn-xxs" title="CSV 내보내기"><Download className="icon-left icon-xs"/>CSV ↓</button>

                  <button onClick={exportJSON} className="btn btn-xxs" title="JSON 내보내기"><Download className="icon-left icon-xs"/>JSON ↓</button>

                  <label className="btn btn-xxs cursor-pointer" title="JSON 파일 가져오기">
                    <Upload className="icon-left icon-xs"/>JSON ↑
                    <input ref={jsonInputRef} type="file" accept="application/json" className="hidden" onChange={importJSON}/>
                  </label>
                  <label className="btn btn-xxs cursor-pointer" title="CSV 파일 가져오기">
                    <Upload className="icon-left icon-xs"/>CSV ↑
                    <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCSV}/>
                  </label>

                  <button onClick={()=>window.print()} className="btn btn-xxs col-span-3" title="인쇄"><Printer className="icon-left icon-xs"/>인쇄</button>
                </div>
              </section>
            </div>
          </aside>

          {/* 우측: 학생 목록 + 모둠 */}
          <section className="col-span-12 lg:col-span-8">
            {/* 학생 목록 */}
            <section className="card p-4 mb-5 print:hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span className="chip chip-amber"></span><h2 className="section-title">학생 목록</h2></div>
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={filterUnplaced} onChange={(e)=>setFilterUnplaced(e.target.checked)}/>미배치만</label>
                  <button onClick={addRow} className="btn btn-xs"><Plus className="icon-left"/>추가</button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-2 mb-2">
                <textarea value={bulk} onChange={(e)=>setBulk(e.target.value)} placeholder={"여러 줄 붙여넣기 예)\n김철수/남\n이영희/여\n박민수 남"} className="input input-sm md:col-span-2 h-20"/>
                <button onClick={applyBulk} className="btn-accent btn-xs">붙여넣기 추가</button>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-[0.88rem]">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="text-left text-slate-600">
                        <th className="p-2" style={{width:'2.2em'}}>#</th>
                        <th className="p-2" style={{width:'12em'}}>이름</th>
                        <th className="p-2" style={{width:'6.5em'}}>성별</th>
                        <th className="p-2">상태</th>
                        <th className="p-2 text-center" style={{width:'6.5em'}}>이동</th>
                        <th className="p-2" style={{width:'6.5em'}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(filterUnplaced? students.filter(s=>!placedIds.has(s.id)) : students).map((s,i)=>{
                        const placed=placedIds.has(s.id), gname=placed?groupNameOf(s.id):''
                        return (
                          <tr key={s.id} className={`border-t row-alt ${placed?'bg-indigo-50/35':''}`}>
                            <td className="p-2 text-slate-500">{i+1}</td>
                            <td className="p-2">
                              <input value={s.name} onChange={(e)=>setStudents(prev=>prev.map(x=>x.id===s.id?{...x,name:e.target.value}:x))} className="input input-sm truncate" style={{width:'12em'}} placeholder="이름"/>
                            </td>
                            <td className="p-2">
                              <select value={s.gender} onChange={(e)=>setStudents(prev=>prev.map(x=>x.id===s.id?{...x,gender:e.target.value as Gender}:x))} className="input input-sm">
                                <option value="미정">미정</option><option value="남">남</option><option value="여">여</option>
                              </select>
                            </td>
                            <td className="p-2 text-[.85rem]">
                              <span className={`inline-flex items-center gap-1 ${placed?'text-indigo-700':'text-slate-600'}`}>
                                {placed? <>배치됨 · <b>{gname}</b></> : '미배치'}
                              </span>
                            </td>
                            <td className="p-2 text-center">
                              <select className="input input-sm select-compact" defaultValue="" onChange={(e)=>{ const v=parseInt(e.target.value); if(!Number.isNaN(v)) assignToGroup(s.id, v-1); e.currentTarget.value='' }} title="모둠 번호로 이동">
                                <option value="">모둠</option>
                                {groups.map((g,idx)=><option key={g.id} value={idx+1} disabled={g.students.length>=maxPerGroup}>{idx+1}</option>)}
                              </select>
                            </td>
                            <td className="p-2 text-right">
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">{s.locked?<Lock className="w-4 h-4"/>:<Unlock className="w-4 h-4"/>}</button>
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
                <span className="text-xs text-slate-500">{groups.reduce((a,g)=>a+g.students.length,0)}명 배치됨 · 미배치 {students.filter(s=>!placedIds.has(s.id)).length}명</span>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {groups.map((g,gi)=>(
                  <motion.div key={g.id} layout className="card p-3 print:shadow-none print:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-slate-800">{g.name}</h3>
                      <span className="text-xs text-slate-500">{g.students.length}/{maxPerGroup}</span>
                    </div>

                    <div onDragOver={(e)=>e.preventDefault()} onDrop={onDropToGroup(gi)} className={`min-h-[110px] grid grid-cols-1 gap-2 p-2 rounded-xl border-2 ${g.students.length<maxPerGroup?'border-dashed border-slate-300':'border-slate-200'}`}>
                      {g.students.map(s=>(
                        <motion.div key={s.id} layout className={`rounded-xl border bg-white shadow-sm ${s.locked?'ring-2 ring-amber-400':''}`}>
                          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl" draggable onDragStart={startDrag(s.id)} title="드래그하여 다른 모둠으로 이동">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${s.gender==='남'?'bg-blue-100 text-blue-700':s.gender==='여'?'bg-pink-100 text-pink-700':'bg-slate-100 text-slate-700'}`}>{s.gender}</span>
                              <span className="font-medium text-slate-800 text-[.95rem]">{s.name||'(이름)'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <select className="input input-xxs" defaultValue="" onChange={(e)=>{ const v=parseInt(e.target.value); if(!Number.isNaN(v)) assignToGroup(s.id, v-1); e.currentTarget.value='' }} title="번호 선택으로 다른 모둠으로 이동">
                                <option value="">#</option>
                                {groups.map((gg,idx)=><option key={gg.id} value={idx+1} disabled={gg.students.length>=maxPerGroup || idx===gi}>{idx+1}</option>)}
                              </select>
                              <button onClick={()=>toggleLock(s.id)} className={`icon-btn ${s.locked?'text-amber-600':'text-slate-500'}`} title="고정">{s.locked?<Lock className="w-4 h-4"/>:<Unlock className="w-4 h-4"/>}</button>
                              <button onClick={()=>moveOut(s.id)} className="icon-btn text-slate-600" title="미배치로 이동">↩︎</button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {g.students.length===0 && <div className="text-center text-slate-400 text-sm py-5">여기로 드래그하여 추가</div>}
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
          .select-compact{ width:6.5em; text-align:center; }
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
          .row-alt:nth-child(even){ background:rgba(148,163,184,.08); }

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
