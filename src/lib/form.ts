/**
 * FormData から文字列を取り出す。
 * ファイルや未入力を空文字に寄せて、Zod へ渡す前の型を揃える。
 */
export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
