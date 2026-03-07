export interface OcrRequest {
  type: 'OCR_REQUEST';
  imageData: string; // base64 data URL
}

export interface OcrResponse {
  type: 'OCR_RESPONSE';
  text?: string;
  error?: string;
}

export interface ContextMenuOcrRequest {
  type: 'CONTEXT_MENU_OCR';
  imageUrl: string;
  tabId: number;
}

export interface ContextMenuOcrResult {
  type: 'CONTEXT_MENU_OCR_RESULT';
  text?: string;
  error?: string;
}

export interface FetchImageRequest {
  type: 'FETCH_IMAGE';
  url: string;
}

export interface FetchImageResponse {
  type: 'FETCH_IMAGE_RESPONSE';
  dataUrl?: string;
  error?: string;
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface SettingsResponse {
  type: 'SETTINGS_RESPONSE';
  autoDetect: boolean;
}

export type MessageRequest =
  | OcrRequest
  | ContextMenuOcrRequest
  | FetchImageRequest
  | GetSettingsRequest;

export type MessageResponse =
  | OcrResponse
  | ContextMenuOcrResult
  | FetchImageResponse
  | SettingsResponse;
