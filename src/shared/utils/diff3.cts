// CJS shim — TypeScript Node16 cannot statically import node-diff3 (ESM-only
// types) from a .ts (CJS) file. This wrapper bridges the gap via require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeDiff3 = require("node-diff3") as {
  merge: (
    a: string | string[],
    o: string | string[],
    b: string | string[],
    options?: {
      stringSeparator?: string | RegExp;
      excludeFalseConflicts?: boolean;
      label?: { a?: string; o?: string; b?: string };
    },
  ) => { conflict: boolean; result: Array<string> };
  diffComm: (
    a: string[],
    b: string[],
  ) => Array<
    | { common: string[] }
    | { buffer1: string[]; buffer2: string[] }
  >;
};

export const merge = nodeDiff3.merge;
export const diffComm = nodeDiff3.diffComm;
