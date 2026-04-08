declare module "@react-pdf/renderer" {
  import type { ComponentType } from "react";

  export const Document: ComponentType<Record<string, unknown>>;
  export const Page: ComponentType<Record<string, unknown>>;
  export const View: ComponentType<Record<string, unknown>>;
  export const Text: ComponentType<Record<string, unknown>>;
  export const StyleSheet: {
    create<T>(styles: T): T;
  };
  export function renderToBuffer(element: unknown): Promise<Buffer>;
}
