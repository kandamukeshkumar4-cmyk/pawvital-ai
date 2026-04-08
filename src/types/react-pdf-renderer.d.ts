declare module "@react-pdf/renderer" {
  import type { ComponentType } from "react";

  export const Document: ComponentType<any>;
  export const Page: ComponentType<any>;
  export const View: ComponentType<any>;
  export const Text: ComponentType<any>;
  export const StyleSheet: {
    create<T>(styles: T): T;
  };
  export function renderToBuffer(element: unknown): Promise<Buffer>;
}
