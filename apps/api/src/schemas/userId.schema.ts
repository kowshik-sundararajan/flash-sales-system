import { z } from "zod";

export const userIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().regex(/^[a-z0-9]{3,32}$/))
  .brand<"UserId">();

export type UserId = z.infer<typeof userIdSchema>;
