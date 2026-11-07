import { z } from "zod";

export const userIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.uuid())
  .brand<"UserId">();

export type UserId = z.infer<typeof userIdSchema>;
