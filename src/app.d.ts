// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

interface ShooterBridgeScanner {
  scan: () => Promise<string>;
}

interface ShooterBridge {
  scanner?: ShooterBridgeScanner;
  getConfig?: () => string;
  saveConfig?: (config: string) => void;
  getFcmToken?: () => string;
  getPlatform?: () => string;
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
    ShooterBridge?: ShooterBridge;
    handleNativeResponse?: (callbackId: string, response: string) => void;
  }
}

export {};
