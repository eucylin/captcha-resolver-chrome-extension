export interface OcrRequest {
  type: 'OCR_REQUEST';
  imageData: string; // base64 data URL
}

export interface OcrResponse {
  type: 'OCR_RESPONSE';
  text?: string;
  error?: string;
}

export interface CaptureTabRequest {
  type: 'CAPTURE_TAB';
}

export interface CaptureTabResponse {
  type: 'CAPTURE_TAB_RESPONSE';
  dataUrl?: string;
  error?: string;
}

export interface ContextMenuCaptureRequest {
  type: 'CONTEXT_MENU_CAPTURE';
  srcUrl: string;
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
  | CaptureTabRequest
  | ContextMenuCaptureRequest
  | GetSettingsRequest;

export type MessageResponse =
  | OcrResponse
  | CaptureTabResponse
  | SettingsResponse;
