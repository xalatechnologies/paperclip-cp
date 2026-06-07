import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: {
    template: '%s | Paperclip Control Center',
    default: 'Paperclip Control Center',
  },
  description: 'AI operations control plane for managing Paperclip companies, agents, skills, secrets, and infrastructure.',
  robots: 'noindex,nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <div className="flex h-full min-h-screen">
          <Sidebar />
          <main className="ml-[220px] flex-1 flex flex-col min-h-screen bg-background">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
