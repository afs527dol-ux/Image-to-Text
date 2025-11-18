export enum AppState {
  IDLE,
  GENERATING_IMAGE,
  SELECTING_IMAGE,
  ANALYZING_IMAGE,
  SHOWING_RESULT,
  ERROR,
}

export interface ImageInfo {
  base64: string;
  mimeType: string;
}

export enum PromptType {
  VOICE,
  SOUNDSCAPE,
}
