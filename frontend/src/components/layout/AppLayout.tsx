import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';

interface AppLayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AppLayout({
  children,
  activeTab,
  onTabChange,
}: AppLayoutProps) {
  const handleNewTransaction = () => {
    // Trigger 'add' tab which App.tsx handles to open TransactionModal
    onTabChange('add');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        onNewTransaction={handleNewTransaction}
      />

      {/* Mobile Header */}
      <MobileHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        onNewTransaction={handleNewTransaction}
      />

      {/* Main Content */}
      <main className="md:ml-64 min-h-screen pt-[72px] md:pt-0 px-4 md:px-8 lg:px-12 py-4 md:py-6">
        {children}
      </main>
    </div>
  );
}
