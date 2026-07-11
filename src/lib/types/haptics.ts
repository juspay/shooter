// Haptic feedback kinds for the web haptic() bridge. A string-literal union —
// not expressible in the type-crafter YAML schema — mirrored by iOS
// (UIImpactFeedbackGenerator/UINotificationFeedbackGenerator/UISelectionFeedbackGenerator)
// and Android (VibrationEffect) native implementations.
export type HapticKind =
  | 'error'
  | 'heavy'
  | 'light'
  | 'medium'
  | 'selection'
  | 'success'
  | 'warning';
