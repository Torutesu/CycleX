import { z } from "zod";
import { BIO_MAX, DISPLAY_NAME_MAX, PREFECTURES, optionValues } from "@/lib/constants";

const prefectureValues = optionValues(PREFECTURES);

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "表示名を入力してください")
    .max(DISPLAY_NAME_MAX, `表示名は${DISPLAY_NAME_MAX}文字以内で入力してください`),
  bio: z
    .string()
    .trim()
    .max(BIO_MAX, `自己紹介は${BIO_MAX}文字以内で入力してください`)
    .optional()
    .transform((value) => value || null),
  // 未選択(空文字・センチネル値)は null として扱う
  prefecture: z
    .string()
    .optional()
    .transform((value) =>
      value && (prefectureValues as readonly string[]).includes(value) ? value : null,
    ),
});

export type ProfileInput = z.input<typeof profileSchema>;
