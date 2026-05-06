import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Слова на букву — тренажёр речи',
  description: 'Минутный тренажёр беглости речи для спикеров — назови как можно больше слов на выпавшую букву.',
};

export const viewport: Viewport = {
  themeColor: '#0a0c12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
