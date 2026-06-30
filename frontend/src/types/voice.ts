export type UploadResponse = {
  doc_id: string;
  filename?: string;
};

export type TokenResponse = {
  token: string;
  room_name: string;
};

export type ApiErrorResponse = {
  detail?: string;
  message?: string;
};
