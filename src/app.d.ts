// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  interface ShooterBridge {
    getConfig?: () => string;
    getFcmToken?: () => string;
    getPlatform?: () => string;
    saveConfig?: (config: string) => void;
    scanner?: ShooterBridgeScanner;
  }

  interface ShooterBridgeScanner {
    scan: () => Promise<string>;
  }

  // Window must use interface — TypeScript requires it for declaration merging
  interface Window {
    handleNativeResponse?: (callbackId: string, response: string) => void;
    ShooterBridge?: ShooterBridge;
    ShooterNativeBridge?: ShooterBridge;
  }
}

export {};
