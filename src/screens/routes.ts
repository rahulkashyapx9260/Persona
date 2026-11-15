/** Every destination in the app, and the params each one expects. */
export type ScreenName =
  | 'home'
  | 'contacts'
  | 'contact'
  | 'history'
  | 'notifications'
  | 'alarms'
  | 'settings'
  | 'appearance';

export type ContactParams = {
  phoneRaw: string;
  displayName: string;
  /** Open the slot editor straight away, after picking a new contact. */
  openEditor?: boolean;
};

export const SCREEN_TITLES: Record<ScreenName, string> = {
  home: 'Persona',
  contacts: 'Contacts & schedules',
  contact: 'Schedule',
  history: 'History',
  notifications: 'Notifications',
  alarms: 'Alarm accuracy',
  settings: 'Settings',
  appearance: 'Appearance',
};
