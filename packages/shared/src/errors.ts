/** Every API error body has this shape. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
