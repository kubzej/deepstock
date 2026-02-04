import { useState, type ReactNode } from 'react';
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
  const [_showAddModal, setShowAddModal] = useState(false);

  const handleNewTransaction = () => {
    setShowAddModal(true);
    // TODO: Open transaction modal/drawer
    console.log('Open new transaction modal');
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
      <main className="md:ml-64 min-h-screen pb-20 md:pb-0">{children}</main>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={onTabChange}
        onFabClick={handleNewTransaction}
      />
    </div>
  );
}
