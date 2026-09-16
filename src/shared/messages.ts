export type PopupMessage =
  { type: 'toggle-panel' } | { type: 'panel-state' } | { type: 'shutdown' };

export type BackgroundMessage =
  | { type: 'notify'; title: string; body: string }
  | { type: 'badge'; text: string }
  | { type: 'beep'; times: number };

export type OffscreenMessage = { type: 'play-beep'; times: number };

export interface PanelStateReply {
  isPanelOpen: boolean;
  isArmed: boolean;
}
