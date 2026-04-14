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
      <div className="pt-header-mobile md:ml-64 md:pt-0">
        <ExchangeRatesBanner />
      </div>

      {/* Main Content */}
      <main className="md:ml-64 min-h-screen px-4 md:px-6 lg:px-8 xl:px-10 pt-header-mobile pb-content-mobile md:pt-6 md:pb-8">
        {children}
      </main>

      {/* PWA Update Prompt */}
      <UpdatePrompt />
    </div>
  );
}
