import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

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

      {/* Main Content */}
      <main className="md:ml-64 min-h-screen pb-20 md:pb-0 px-4 md:px-8 lg:px-12 py-4 md:py-6">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={onTabChange}
        onFabClick={handleNewTransaction}
      />
    </div>
  );
}
