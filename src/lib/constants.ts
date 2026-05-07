export const LETTERS = [
  'А','Б','В','Г','Д','Е','Ж','З','И','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Э','Ю','Я',
] as const;

export type PartOfSpeech = 'noun' | 'adjective' | 'verb' | 'mixed';

export interface PosDef {
  id: PartOfSpeech;
  label: string;
  hint: string;
}

export const PARTS_OF_SPEECH: PosDef[] = [
  { id: 'noun',      label: 'Существительные', hint: 'кто? что?' },
  { id: 'adjective', label: 'Прилагательные',  hint: 'какой? какая?' },
  { id: 'verb',      label: 'Глаголы',         hint: 'что делать?' },
  { id: 'mixed',     label: 'Смешанный',       hint: 'любая часть речи' },
];

export const POS_LABEL_LOWER: Record<PartOfSpeech, string> = {
  noun: 'существительные',
  adjective: 'прилагательные',
  verb: 'глаголы',
  mixed: 'смешанный',
};

export const POS_ACCUSATIVE: Record<PartOfSpeech, string> = {
  noun: 'существительные',
  adjective: 'прилагательные',
  verb: 'глаголы',
  mixed: 'любые слова',
};

export const POS_CONTEXT: Record<PartOfSpeech, string> = {
  noun:      'Сейчас выпадет случайная буква. За {sec} назови как можно больше <strong>существительных</strong> на эту букву. Можно в любом падеже (стол / стола / столу) — это дополнительная нагрузка для мозга.',
  adjective: 'Сейчас выпадет случайная буква. За {sec} назови как можно больше <strong>прилагательных</strong> на эту букву. Любой род и падеж (красивый / красивая / красивого).',
  verb:      'Сейчас выпадет случайная буква. За {sec} назови как можно больше <strong>глаголов</strong> на эту букву. Любые формы — инфинитив, спряжения, времена (бежать / бегу / бежал).',
  mixed:     'Сейчас выпадет случайная буква. За {sec} назови как можно больше <strong>любых слов</strong> на эту букву. Часть речи не важна — лишь бы по-русски.',
};

export const STORAGE_KEYS = {
  history:     'speech-trainer:history',
  lastLetters: 'speech-trainer:last-letters',
  settings:    'speech-trainer:settings',
  micPerm:     'speech-trainer:mic-permission',
  posChoice:   'speech-trainer:pos',
} as const;

export interface Attempt {
  id: string;
  ts: number;
  letter: string;
  partOfSpeech: PartOfSpeech;
  duration: number;
  count: number;
  countAuto: number | null;
  words: string[];
  tier: 'warmup' | 'beginner' | 'normal' | 'master';
}

export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  duration: number;   // 30 / 60 / 90 / 120
  soundOn: boolean;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = { duration: 60, soundOn: true, theme: 'auto' };

export const THEME_LABEL: Record<Theme, string> = {
  auto:  'Авто',
  light: 'День',
  dark:  'Ночь',
};
