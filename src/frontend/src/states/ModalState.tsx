import { create } from 'zustand';

interface ModalStateProps {
  openModals: Record<string, boolean>;
  isModalOpen: (modalKey: string) => boolean;
  setModalOpen: (modalKey: string, isOpen: boolean) => void;
}

/**
 * Global state manager for determining modal visibility.
 * Useful to share modal state (open / closed) between components.
 */
export const useModalState = create<ModalStateProps>()((set, get) => ({
  openModals: {},

  isModalOpen: (modalKey: string) => {
    return get().openModals[modalKey] ?? false;
  },

  setModalOpen: (modalKey: string, isOpen: boolean) => {
    set((state) => {
      const current = state.openModals[modalKey] ?? false;

      // No-op when value is unchanged to avoid unnecessary render cascades.
      if (current === isOpen) {
        return state;
      }

      return {
        openModals: {
          ...state.openModals,
          [modalKey]: isOpen
        }
      };
    });
  }
}));
