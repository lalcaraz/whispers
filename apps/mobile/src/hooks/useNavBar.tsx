import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type NavBarConfig = {
  title: string;
  visible: boolean;
  leftAction?: () => void;
  rightAction?: () => void;
  leftIcon?: string;
  rightIcon?: string;
};

type NavBarContextType = {
  config: NavBarConfig;
  setTitle: (title: string) => void;
  setVisible: (visible: boolean) => void;
  setLeftAction: (action?: () => void, icon?: string) => void;
  setRightAction: (action?: () => void, icon?: string) => void;
  reset: () => void;
};

const defaultConfig: NavBarConfig = {
  title: 'Whispers',
  visible: true,
};

const NavBarContext = createContext<NavBarContextType | undefined>(undefined);

export function NavBarProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<NavBarConfig>(defaultConfig);

  const setTitle = useCallback((title: string) => {
    setConfig((prev) => ({ ...prev, title }));
  }, []);

  const setVisible = useCallback((visible: boolean) => {
    setConfig((prev) => ({ ...prev, visible }));
  }, []);

  const setLeftAction = useCallback((action?: () => void, icon?: string) => {
    setConfig((prev) => ({ ...prev, leftAction: action, leftIcon: icon }));
  }, []);

  const setRightAction = useCallback((action?: () => void, icon?: string) => {
    setConfig((prev) => ({ ...prev, rightAction: action, rightIcon: icon }));
  }, []);

  const reset = useCallback(() => {
    setConfig(defaultConfig);
  }, []);

  return (
    <NavBarContext.Provider
      value={{
        config,
        setTitle,
        setVisible,
        setLeftAction,
        setRightAction,
        reset,
      }}
    >
      {children}
    </NavBarContext.Provider>
  );
}

export default function useNavBar() {
  const context = useContext(NavBarContext);
  if (context === undefined) {
    throw new Error('useNavBar must be used within a NavBarProvider');
  }
  return context;
}
