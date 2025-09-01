export type Gender = '남' | '여' | '미정'
export interface Student { id: string; name: string; gender: Gender; locked?: boolean; absent?: boolean }
export interface Group { id: string; name: string; students: Student[] }
export type Mode = '완전랜덤' | '성비균형' | '남여섞기OFF'
