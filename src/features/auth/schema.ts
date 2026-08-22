import { z } from "zod";
import { DISPLAY_NAME_MAX } from "@/lib/constants";

/** FR-01-1: 8文字以上、英字・数字を各1文字以上 */
export const passwordSchema = z
  .string()
  .min(8, "パスワードは8文字以上で入力してください")
  .max(72, "パスワードは72文字以内で入力してください")
  .regex(/[A-Za-z]/, "英字を1文字以上含めてください")
  .regex(/[0-9]/, "数字を1文字以上含めてください");

export const emailSchema = z.email("メールアドレスの形式が正しくありません");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "表示名を入力してください")
  .max(DISPLAY_NAME_MAX, `表示名は${DISPLAY_NAME_MAX}文字以内で入力してください`);

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "パスワードを入力してください"),
});

export const resetRequestSchema = z.object({
  email: emailSchema,
});

export const resetUpdateSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

export const changeEmailSchema = z.object({
  email: emailSchema,
});

export const changePasswordSchema = resetUpdateSchema;

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetUpdateInput = z.infer<typeof resetUpdateSchema>;
