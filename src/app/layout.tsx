import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp AI Bot Starter',
  description:
    'Bot de WhatsApp que responde con la información de tu negocio. Next.js + Supabase + LLM.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
