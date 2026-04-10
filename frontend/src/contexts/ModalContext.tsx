import { createContext, useContext } from 'react';

interface ModalContextType {
  openTransactionModal: () => void;
  openOptionModal: () => void;
}

export const ModalContext = createContext<ModalContextType | undefined>(
  undefined,
);

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
