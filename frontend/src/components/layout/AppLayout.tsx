import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { UpdatePrompt } from '@/components/shared/UpdatePrompt';
import { ExchangeRatesBanner } from '@/components/shared/ExchangeRatesBanner';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Header */}
      <MobileHeader />

      {/* Exchange rates error banner */}
      <div className="md:ml-64">
        <ExchangeRatesBanner />
      </div>

      {/* Main Content */}
      <main className="md:ml-64 min-h-screen px-4 md:px-8 lg:px-12 pt-header-mobile pb-content-mobile md:pt-6 md:pb-6">
        {children}
      </main>

      {/* PWA Update Prompt */}
      <UpdatePrompt />
    </div>
  );
}
