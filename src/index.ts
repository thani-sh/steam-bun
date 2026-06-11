import { z } from "zod";

/**
 * method defines a SteamBun streaming RPC method with its name and Zod input/output schemas.
 */
export function method<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  name: string,
  config: { input: I; output: O },
): MethodDef<I, O> {
  return {
    name,
    input: config.input,
    output: config.output,
  };
}

/**
 * MethodDef represents the type structure of a method definition.
 */
export type MethodDef<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  name: string;
  input: I;
  output: O;
};
