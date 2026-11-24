// Personality quiz runner. Questions are public data; the server does the scoring
// so results and rewards can't be invented on the client.

import { outcomeLabel, scoreRange, type PersonaQuiz } from '../../../shared/personality';
import { sfx } from '../audio';
import { net } from '../net';
import { btn, h, icon, modal, toast } from '../ui/dom';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function openPersona(quiz: PersonaQuiz, onDone?: () => void) {
  const body = h('div', { class: 'quiz persona', style: { '--theme': quiz.colour } as any });
  const m = modal(quiz.title, body, { onClose: onDone });
  const answers: number[] = [];

  const submit = async (p: { answers?: number[]; month?: number; day?: number }) => {
    body.replaceChildren(h('p', { class: 'muted-text', style: { textAlign: 'center' } }, 'Working you out…'));
    try {
      const res = await net.request('persona.submit', { quizId: quiz.id, ...p });
      showResult(res.outcome, res.scores, res.reward.tokens, res.reward.label);
    } catch (e) { toast((e as Error).message, 'warn'); m.close(); }
  };

  const showResult = (outcome: string, scores: Record<string, number>, tokens: number, label: string) => {
    sfx.chime();
    const o = quiz.outcomes[outcome];
    const bars = quiz.showBars || quiz.kind === 'axes' ? drawBars(quiz, scores) : null;
    body.replaceChildren(
      h('div', { class: 'persona-result' },
        h('div', { class: 'confetti' }, ...Array.from({ length: 14 }, (_, i) => h('i', { style: { '--i': String(i) } as any }))),
        h('small', { class: 'muted-text' }, 'You are…'),
        h('h3', { class: 'persona-name' }, outcomeLabel(quiz.id, outcome)),
        h('p', null, o?.blurb ?? ''),
        bars,
        h('div', { class: 'row tight persona-reward' }, icon('pebble', 20), h('b', null, `+${tokens}`), h('small', { class: 'muted-text' }, label)),
        h('small', { class: 'muted-text' }, quiz.basedOn, '. Just for fun, not a diagnosis.')),
      h('div', { class: 'row end' },
        quiz.kind === 'birthday' ? null : btn('Take it again', () => { answers.length = 0; ask(0); }, 'ghost'),
        btn('Lovely', () => m.close(), 'primary')));
  };

  const ask = (i: number) => {
    const q = quiz.questions[i];
    const dots = h('div', { class: 'quiz-dots' }, ...quiz.questions.map((_, k) => h('span', { class: `qdot ${k < i ? 'right' : k === i ? 'now' : ''}` })));
    body.replaceChildren(
      dots,
      h('div', { class: 'quiz-count' }, `${i + 1} of ${quiz.questions.length}`,
        i > 0 ? h('button', { class: 'link', type: 'button', onclick: () => { answers.pop(); ask(i - 1); } }, 'Back') : h('span')),
      h('p', { class: 'quiz-q' }, q.q),
      h('div', { class: 'persona-options' }, ...q.options.map((opt, k) => btn(opt.text, () => {
        answers[i] = k;
        if (i + 1 < quiz.questions.length) ask(i + 1); else submit({ answers: answers.slice() });
      }, 'quiz-option'))));
  };

  const askBirthday = () => {
    const month = h('select', { 'aria-label': 'Month' }, ...MONTHS.map((name, k) => h('option', { value: String(k + 1) }, name))) as HTMLSelectElement;
    const day = h('select', { 'aria-label': 'Day' }) as HTMLSelectElement;
    const fillDays = () => {
      const keep = Number(day.value) || 1;
      day.replaceChildren(...Array.from({ length: DAYS_IN[Number(month.value) - 1] }, (_, k) => h('option', { value: String(k + 1) }, String(k + 1))));
      day.value = String(Math.min(keep, day.options.length));
    };
    month.addEventListener('change', fillDays);
    fillDays();
    body.replaceChildren(
      h('p', null, 'When’s your birthday? Month and day are all the stars need.'),
      h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', null, 'Month'), month), h('label', { class: 'field' }, h('span', null, 'Day'), day)),
      h('small', { class: 'muted-text' }, 'We only keep your sign. Your birthday isn’t saved anywhere.'),
      h('div', { class: 'row end' }, btn([icon('star', 18), 'Read my stars'], () => submit({ month: Number(month.value), day: Number(day.value) }), 'primary')));
  };

  if (quiz.kind === 'birthday') askBirthday(); else ask(0);
}

function drawBars(quiz: PersonaQuiz, scores: Record<string, number>) {
  const range = scoreRange(quiz);
  const pct = (k: string) => {
    const [lo, hi] = range[k];
    return hi > lo ? Math.round(((scores[k] - lo) / (hi - lo)) * 100) : 0;
  };
  if (quiz.kind === 'axes') {
    // One bar per axis, leaning towards whichever letter won.
    return h('div', { class: 'persona-bars' }, ...quiz.axes!.map(([a, b]) => {
      const total = (scores[a] ?? 0) + (scores[b] ?? 0) || 1;
      const share = Math.round(((scores[a] ?? 0) / total) * 100);
      return h('div', { class: 'axis-row' }, h('b', null, a), h('div', { class: 'bar axis' }, h('span', { style: { width: `${share}%` } })), h('b', null, b));
    }));
  }
  return h('div', { class: 'persona-bars' }, ...Object.keys(quiz.outcomes).map((k) =>
    h('div', { class: 'trait-row' }, h('small', null, quiz.outcomes[k].name.split(' · ')[0]), h('div', { class: 'bar' }, h('span', { style: { width: `${pct(k)}%` } })))));
}
