// Quizzes and minigames. Both are server-authoritative: the server holds the
// answers and the card layout, so the client can only report choices, never scores.

import { randomUUID } from 'node:crypto';
import { PERSONA_BY_ID, PERSONA_FIRST_REWARD, PERSONA_REPEAT_REWARD, scorePersona, starSign } from '../shared/personality';
import type { QuizMeta, QuizQuestionPublic, Reward } from '../shared/types';
import { QUIZ_BY_ID, QUIZZES, type QuizQuestion } from './data/quizzes';
import { diminishing, grant } from './economy';
import type { UserData } from './store';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ================================================================ quizzes

interface QuizSession { id: string; userId: string; quizId: string; questions: QuizQuestion[]; index: number; score: number; startedAt: number }
const quizSessions = new Map<string, QuizSession>();

export function quizList(): QuizMeta[] {
  return QUIZZES.map(({ questions, draw, ...meta }) => ({ ...meta, questionCount: Math.min(draw, questions.length) }));
}

export function startQuiz(userId: string, quizId: string): { sessionId: string; questions: QuizQuestionPublic[] } {
  const quiz = QUIZ_BY_ID[quizId];
  if (!quiz) throw new Error('Unknown quiz');
  for (const [id, s] of quizSessions) if (s.userId === userId) quizSessions.delete(id);
  const questions = shuffle(quiz.questions).slice(0, quiz.draw).map((q) => {
    const order = shuffle(q.options.map((_, i) => i));
    return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
  const id = randomUUID();
  quizSessions.set(id, { id, userId, quizId, questions, index: 0, score: 0, startedAt: Date.now() });
  return { sessionId: id, questions: questions.map(({ q, options }) => ({ q, options })) };
}

export function answerQuiz(user: UserData, userId: string, sessionId: string, index: number, choice: number) {
  const s = quizSessions.get(sessionId);
  if (!s || s.userId !== userId) throw new Error('That quiz has finished');
  if (Date.now() - s.startedAt > 15 * 60 * 1000) { quizSessions.delete(sessionId); throw new Error('That quiz timed out'); }
  if (index !== s.index) throw new Error('Answer the questions in order');
  const q = s.questions[index];
  const correct = choice === q.answer;
  if (correct) s.score++;
  s.index++;
  const done = s.index >= s.questions.length;
  let reward: Reward | undefined;
  if (done) {
    quizSessions.delete(sessionId);
    const quiz = QUIZ_BY_ID[s.quizId];
    const frac = s.score / s.questions.length;
    const band = quiz.bands.find((b) => frac >= b.min) ?? quiz.bands[quiz.bands.length - 1];
    const mult = diminishing(user, `quiz:${quiz.id}`);
    let tokens = band.tokens * mult;
    const items: string[] = [];
    const materials: string[] = [];
    if (frac === 1) {
      if (quiz.rewardItem && !user.collection.includes(quiz.rewardItem)) items.push(quiz.rewardItem);
      else if (quiz.rewardMaterial && !user.materials.includes(quiz.rewardMaterial)) materials.push(quiz.rewardMaterial);
      else tokens += 15 * mult;
    }
    reward = grant(user, { tokens, items, materials, label: `${band.label} — ${s.score}/${s.questions.length}`, multiplier: mult });
  }
  return { correct, correctIndex: q.answer, score: s.score, done, reward };
}

// ================================================================ personality quizzes

/** Score a personality quiz (or read a star sign) and pay out: generously the first time, a token amount after. */
export function submitPersona(user: UserData, quizId: string, answers?: number[], month?: number, day?: number) {
  const quiz = PERSONA_BY_ID[quizId];
  if (!quiz) throw new Error('Unknown quiz');
  const result = quiz.kind === 'birthday'
    ? { outcome: starSign(Number(month), Number(day)), scores: {} }
    : scorePersona(quiz, (answers ?? []).map(Number));
  user.traits ??= {};
  const first = !(quizId in user.traits);
  user.traits[quizId] = result.outcome;
  const mult = first ? 1 : diminishing(user, `persona:${quizId}`);
  const reward = grant(user, {
    tokens: first ? PERSONA_FIRST_REWARD : PERSONA_REPEAT_REWARD * mult,
    label: first ? 'Result added to your player card' : 'Result updated',
    multiplier: mult,
  });
  return { ...result, reward };
}

// ================================================================ Tide Pool Pairs (memory)

export const MEMORY = { pairs: 8, cols: 4, timeLimit: 90, exclusive: 'sailboat', perfectMoves: 12 };

interface MemorySession {
  id: string; userId: string; faces: number[]; matched: boolean[]; first: number | null;
  moves: number; pairs: number; startedAt: number; done: boolean;
}
const memorySessions = new Map<string, MemorySession>();

export function startMemory(userId: string) {
  for (const [id, s] of memorySessions) if (s.userId === userId) memorySessions.delete(id);
  const faces = shuffle([...Array(MEMORY.pairs).keys()].flatMap((f) => [f, f]));
  const id = randomUUID();
  memorySessions.set(id, { id, userId, faces, matched: faces.map(() => false), first: null, moves: 0, pairs: 0, startedAt: Date.now(), done: false });
  return { sessionId: id, cards: faces.length, cols: MEMORY.cols, timeLimit: MEMORY.timeLimit, serverTime: Date.now() };
}

function memoryReward(user: UserData, s: MemorySession): Reward {
  s.done = true;
  memorySessions.delete(s.id);
  const mult = diminishing(user, 'game:memory');
  if (s.pairs < MEMORY.pairs) {
    const timedOut = (Date.now() - s.startedAt) / 1000 >= MEMORY.timeLimit;
    const found = `${s.pairs} pair${s.pairs === 1 ? '' : 's'} found`;
    return grant(user, { tokens: s.pairs * 3 * mult, label: timedOut ? `The tide came in — ${found}` : `Finished early — ${found}`, multiplier: mult });
  }
  const remaining = Math.max(0, MEMORY.timeLimit - (Date.now() - s.startedAt) / 1000);
  let tokens = 30 + Math.floor(remaining / 6);
  const items: string[] = [];
  let label = `Cleared in ${s.moves} moves`;
  if (s.moves <= MEMORY.perfectMoves) {
    tokens += 30;
    label = `Sharp eyes! ${s.moves} moves`;
    if (!user.collection.includes(MEMORY.exclusive)) items.push(MEMORY.exclusive);
  } else if (s.moves <= 16) tokens += 20;
  else if (s.moves <= 22) tokens += 10;
  return grant(user, { tokens: tokens * mult, items, label, multiplier: mult });
}

export function flipMemory(user: UserData, userId: string, sessionId: string, index: number) {
  const s = memorySessions.get(sessionId);
  if (!s || s.userId !== userId || s.done) throw new Error('That game has finished');
  if (!Number.isInteger(index) || index < 0 || index >= s.faces.length) throw new Error('No card there');
  if ((Date.now() - s.startedAt) / 1000 > MEMORY.timeLimit + 2) {
    return { index, face: s.faces[index], moves: s.moves, pairs: s.pairs, done: true, reward: memoryReward(user, s) };
  }
  if (s.matched[index] || s.first === index) throw new Error('Pick another card');
  const face = s.faces[index];
  if (s.first === null) {
    s.first = index;
    return { index, face, moves: s.moves, pairs: s.pairs, done: false };
  }
  const other = s.first;
  s.first = null;
  s.moves++;
  const match = s.faces[other] === face;
  if (match) { s.matched[other] = s.matched[index] = true; s.pairs++; }
  const done = s.pairs === MEMORY.pairs;
  return {
    index, face, pair: { other, otherFace: s.faces[other], match }, moves: s.moves, pairs: s.pairs, done,
    reward: done ? memoryReward(user, s) : undefined,
  };
}

export function endMemory(user: UserData, userId: string, sessionId: string) {
  const s = memorySessions.get(sessionId);
  if (!s || s.userId !== userId || s.done) throw new Error('That game has finished');
  return { reward: memoryReward(user, s) };
}
