// Quiz runner. The server knows the answers; we only send choices.

import type { QuizMeta, QuizQuestionPublic } from '../../../shared/types';
import { sfx } from '../audio';
import { net } from '../net';
import { btn, h, modal, toast } from '../ui/dom';
import { showReward } from '../ui/panels';

export async function openQuiz(meta: QuizMeta) {
  let session: { sessionId: string; questions: QuizQuestionPublic[] };
  try { session = await net.request('quiz.start', { quizId: meta.id }); }
  catch (e) { toast((e as Error).message, 'warn'); return; }

  const body = h('div', { class: 'quiz' });
  const m = modal(meta.title, body, { wide: false });
  let index = 0;
  let score = 0;
  const results: (boolean | null)[] = session.questions.map(() => null);

  const draw = () => {
    const q = session.questions[index];
    const dots = h('div', { class: 'quiz-dots' }, ...results.map((r, i) => h('span', { class: `qdot ${r === true ? 'right' : r === false ? 'wrong' : i === index ? 'now' : ''}` })));
    const options = h('div', { class: 'quiz-options' });
    let locked = false;
    q.options.forEach((opt, i) => {
      const b = btn(opt, async () => {
        if (locked) return;
        locked = true;
        b.classList.add('picked');
        try {
          const res = await net.request('quiz.answer', { sessionId: session.sessionId, index, choice: i });
          results[index] = res.correct;
          score = res.score;
          (options.children[res.correctIndex] as HTMLElement).classList.add('right');
          if (!res.correct) b.classList.add('wrong');
          res.correct ? sfx.right() : sfx.wrong();
          dots.children[index].className = `qdot ${res.correct ? 'right' : 'wrong'}`;
          setTimeout(() => {
            if (res.done && res.reward) { m.close(); showReward(res.reward); }
            else { index++; draw(); }
          }, res.correct ? 750 : 1300);
        } catch (e) { toast((e as Error).message, 'warn'); m.close(); }
      }, 'quiz-option');
      options.append(b);
    });
    body.replaceChildren(
      dots,
      h('div', { class: 'quiz-count' }, `Question ${index + 1} of ${session.questions.length}`, h('span', { class: 'quiz-score' }, `${score} right`)),
      h('p', { class: 'quiz-q' }, q.q),
      options,
    );
  };
  draw();
}
