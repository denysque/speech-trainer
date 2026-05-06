export type Tier = 'warmup' | 'beginner' | 'normal' | 'master';

export interface Grade {
  tier: Tier;
  title: string;
  subtitle: string;
  support: string;
}

export function gradeResult(count: number): Grade {
  const n = Number(count) || 0;
  if (n >= 30) return {
    tier: 'master', title: 'Мастер', subtitle: 'Гордость Эминема',
    support: 'Ты в отличной форме. Перед выходом на сцену достаточно одной такой попытки для разогрева — речевой аппарат уже готов.',
  };
  if (n >= 20) return {
    tier: 'normal', title: 'Норм', subtitle: 'Красава!',
    support: 'Богатый словарный запас. И помни: на сцене стресс крадёт слова даже у профи — это нормально, продолжай тренироваться.',
  };
  if (n >= 10) return {
    tier: 'beginner', title: 'Начальный', subtitle: 'Гордость Паши Техника',
    support: 'Хороший уровень — этого хватает для повседневной речи. Ещё несколько попыток, и слова польются легче.',
  };
  return {
    tier: 'warmup', title: 'Разогрев', subtitle: 'Ещё разок — язык только просыпается',
    support: 'Не сдавайся, всё получится. В стрессе мозг тормозит — это нормально, мы все забываем слова. Продолжай тренироваться, и беглость придёт.',
  };
}
