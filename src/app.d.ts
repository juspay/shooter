// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

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

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Window {
    handleNativeResponse?: (callbackId: string, response: string) => void;
    ShooterBridge?: ShooterBridge;
  }
}

export {};
