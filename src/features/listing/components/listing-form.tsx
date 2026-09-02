"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Field } from "@/components/form/field";
import { ImageUploader } from "@/features/listing/components/image-uploader";
import { useFormBackup } from "@/features/listing/components/use-form-backup";
import { saveDraft, publishListing } from "@/features/listing/actions";
import { calcFee } from "@/features/listing/rules";
import {
  CATEGORIES,
  COMPONENTS,
  CONDITIONS,
  DELIVERY_METHODS,
  DESCRIPTION_MAX,
  FRAME_SIZES,
  MILEAGES,
  MODEL_YEAR_MIN,
  PARTS_SUBCATEGORIES,
  PREFECTURES,
  TITLE_MAX,
  isBikeCategory,
  modelYearMax,
} from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

/**
 * エラーをまとめて出すときの項目名と並び順。
 * フォームが長く、項目ごとのエラーだけだと
 * 何が足りないのか画面をスクロールして探すことになる。
 */
const FIELD_LABELS: [key: string, label: string][] = [
  ["imagePaths", "商品画像"],
  ["category", "カテゴリ"],
  ["partsSubcategory", "パーツの種類"],
  ["title", "タイトル"],
  ["brandId", "ブランド"],
  ["brandOther", "ブランド名"],
  ["modelName", "モデル名"],
  ["modelYear", "年式"],
  ["frameSize", "フレームサイズ"],
  ["frameSizeCm", "フレームサイズ(cm)"],
  ["component", "コンポーネント"],
  ["componentNote", "コンポーネントの補足"],
  ["mileage", "走行距離の目安"],
  ["condition", "コンディション"],
  ["description", "説明"],
  ["price", "希望価格"],
  ["deliveryMethod", "受渡方法"],
  ["shippingFromPref", "発送元の地域"],
  ["meetupPref", "受渡地域"],
];

/** 入力欄までスクロールして focus する。Select はトリガーが focus 対象 */
function focusField(key: string) {
  const element = document.getElementById(key);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => element.focus({ preventScroll: true }), 300);
}

const NONE = "__none__";
const BRAND_OTHER = "__other__";

export type ListingFormDefaults = {
  id?: string;
  category: string;
  partsSubcategory: string;
  title: string;
  brandId: string;
  brandOther: string;
  modelName: string;
  modelYear: string;
  frameSize: string;
  frameSizeCm: string;
  component: string;
  componentNote: string;
  mileage: string;
  condition: string;
  description: string;
  price: string;
  deliveryMethod: string;
  shippingFromPref: string;
  meetupPref: string;
  imagePaths: string[];
};

type ListingFormProps = {
  userId: string;
  brands: { id: string; name: string }[];
  feeRate: number;
  defaults: ListingFormDefaults;
  /** 下書き保存を出すか(公開中の商品の編集では出さない) */
  allowDraft: boolean;
};

export function ListingForm({ userId, brands, feeRate, defaults, allowDraft }: ListingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ListingFormDefaults>(defaults);
  // 一覧から外した画像。保存が成功した時点でサーバ側が Storage から消す
  const [discardedPaths, setDiscardedPaths] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // 新規作成のときだけ、入力途中の控えを端末に持つ。
  // 編集はサーバー側に正が残っているので対象外
  const backupEnabled = !defaults.id;
  const { backup, dismiss, clear } = useFormBackup("new", values, backupEnabled);
  const hasBackup = Boolean(backup && backup.title !== defaults.title);

  const isParts = values.category === "parts";
  const showBikeFields = isBikeCategory(values.category);
  const priceNumber = Number(values.price);
  const { fee, payout } = calcFee(Number.isFinite(priceNumber) ? priceNumber : 0, feeRate);

  const years = Array.from(
    { length: modelYearMax() - MODEL_YEAR_MIN + 1 },
    (_, i) => modelYearMax() - i,
  );

  function set<K extends keyof ListingFormDefaults>(key: K, value: ListingFormDefaults[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // 上部にまとめて出す「足りない項目」。フォームの並び順に揃える
  const missing = FIELD_LABELS.flatMap(([key, label]) => {
    const message = fieldErrors[key]?.[0];
    return message ? [{ key, label, message }] : [];
  });

  function buildPayload() {
    return {
      id: values.id ?? null,
      category: values.category || null,
      partsSubcategory: values.partsSubcategory === NONE ? null : values.partsSubcategory || null,
      title: values.title,
      brandId: values.brandId && values.brandId !== BRAND_OTHER ? values.brandId : null,
      brandOther: values.brandId === BRAND_OTHER ? values.brandOther : null,
      modelName: values.modelName || null,
      modelYear: values.modelYear === NONE ? null : values.modelYear || null,
      frameSize: values.frameSize === NONE ? null : values.frameSize || null,
      frameSizeCm: values.frameSizeCm || null,
      component: values.component === NONE ? null : values.component || null,
      componentNote: values.componentNote || null,
      mileage: values.mileage === NONE ? null : values.mileage || null,
      condition: values.condition || null,
      description: values.description || null,
      price: values.price || null,
      deliveryMethod: values.deliveryMethod || null,
      shippingFromPref: values.shippingFromPref === NONE ? null : values.shippingFromPref || null,
      meetupPref: values.meetupPref === NONE ? null : values.meetupPref || null,
      imagePaths: values.imagePaths,
      discardedImagePaths: discardedPaths,
    };
  }

  function submit(mode: "draft" | "publish") {
    setFieldErrors({});
    setFormError(null);

    startTransition(async () => {
      const payload = buildPayload();
      const result = mode === "draft" ? await saveDraft(payload) : await publishListing(payload);

      if (!result.ok) {
        const errors = result.fieldErrors ?? {};
        setFormError(result.error);
        setFieldErrors(errors);
        toast.error(result.error);
        // 何が足りないかは上部のまとめで示すので、まずそこを見せる
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      clear();

      if (mode === "draft") {
        set("id", result.data.id);
        toast.success("下書きを保存しました");
        router.replace(`/sell/${result.data.id}/edit`);
        router.refresh();
      } else {
        toast.success("商品を公開しました");
        router.push(`/items/${result.data.id}`);
      }
    });
  }

  return (
    <form
      className="space-y-8 pb-28 md:pb-8"
      onSubmit={(event) => {
        event.preventDefault();
        submit("publish");
      }}
    >
      {hasBackup && (
        <Alert>
          <AlertDescription>
            <p>前回この端末で入力していた内容が残っています。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (backup) setValues(backup);
                  dismiss();
                }}
              >
                入力内容を復元する
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clear}>
                破棄して新しく書く
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">{formError}</p>
            {missing.length > 0 && (
              <ul className="mt-2 space-y-1">
                {missing.map(({ key, label, message }) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => focusField(key)}
                      className="text-left underline underline-offset-2"
                    >
                      {label}: {message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ---------------- 画像 ---------------- */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">商品画像</h2>
        <ImageUploader
          userId={userId}
          value={values.imagePaths}
          onChange={(paths) => set("imagePaths", paths)}
          onDiscard={(path) => setDiscardedPaths((prev) => [...prev, path])}
          error={fieldErrors.imagePaths}
        />
      </section>

      <Separator />

      {/* ---------------- 基本情報 ---------------- */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold">基本情報</h2>

        <Field id="category" label="カテゴリ" required errors={fieldErrors.category}>
          <Select value={values.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger id="category" className="h-11 w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {isParts && (
          <Field
            id="partsSubcategory"
            label="パーツの種類"
            required
            errors={fieldErrors.partsSubcategory}
          >
            <Select
              value={values.partsSubcategory}
              onValueChange={(v) => set("partsSubcategory", v)}
            >
              <SelectTrigger id="partsSubcategory" className="h-11 w-full">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {PARTS_SUBCATEGORIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field
          id="title"
          label="タイトル"
          required
          hint="例: TREK Emonda SL5 2021年 サイズ52 105仕様"
          counter={{ value: values.title.length, max: TITLE_MAX }}
          errors={fieldErrors.title}
        >
          <Input
            id="title"
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={TITLE_MAX}
            className="h-11"
          />
        </Field>

        <Field id="brandId" label="ブランド" required errors={fieldErrors.brandId}>
          <Select value={values.brandId} onValueChange={(v) => set("brandId", v)}>
            <SelectTrigger id="brandId" className="h-11 w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
              <SelectItem value={BRAND_OTHER}>その他(自由入力)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {values.brandId === BRAND_OTHER && (
          <Field id="brandOther" label="ブランド名" required errors={fieldErrors.brandOther}>
            <Input
              id="brandOther"
              value={values.brandOther}
              onChange={(e) => set("brandOther", e.target.value)}
              maxLength={80}
              className="h-11"
            />
          </Field>
        )}

        <Field id="modelName" label="モデル名" errors={fieldErrors.modelName}>
          <Input
            id="modelName"
            value={values.modelName}
            onChange={(e) => set("modelName", e.target.value)}
            maxLength={80}
            className="h-11"
          />
        </Field>
      </section>

      <Separator />

      {/* ---------------- スペック ---------------- */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold">スペック</h2>

        <Field id="modelYear" label="年式" errors={fieldErrors.modelYear}>
          <Select value={values.modelYear} onValueChange={(v) => set("modelYear", v)}>
            <SelectTrigger id="modelYear" className="h-11 w-full">
              <SelectValue placeholder="不明" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>不明</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {showBikeFields && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="frameSize" label="フレームサイズ" errors={fieldErrors.frameSize}>
                <Select value={values.frameSize} onValueChange={(v) => set("frameSize", v)}>
                  <SelectTrigger id="frameSize" className="h-11 w-full">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>指定しない</SelectItem>
                    {FRAME_SIZES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                id="frameSizeCm"
                label="フレームサイズ(cm)"
                hint="実寸がわかる場合に入力"
                errors={fieldErrors.frameSizeCm}
              >
                <Input
                  id="frameSizeCm"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={1}
                  max={999}
                  value={values.frameSizeCm}
                  onChange={(e) => set("frameSizeCm", e.target.value)}
                  className="h-11"
                />
              </Field>
            </div>

            <Field id="mileage" label="走行距離の目安" errors={fieldErrors.mileage}>
              <Select value={values.mileage} onValueChange={(v) => set("mileage", v)}>
                <SelectTrigger id="mileage" className="h-11 w-full">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>指定しない</SelectItem>
                  {MILEAGES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <Field id="component" label="コンポーネント" errors={fieldErrors.component}>
          <Select value={values.component} onValueChange={(v) => set("component", v)}>
            <SelectTrigger id="component" className="h-11 w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>指定しない</SelectItem>
              {COMPONENTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="componentNote"
          label="コンポーネントの補足"
          hint="混成や交換済みパーツがあれば記入してください"
          errors={fieldErrors.componentNote}
        >
          <Input
            id="componentNote"
            value={values.componentNote}
            onChange={(e) => set("componentNote", e.target.value)}
            maxLength={200}
            className="h-11"
          />
        </Field>

        <Field id="condition" label="コンディション" required errors={fieldErrors.condition}>
          <Select value={values.condition} onValueChange={(v) => set("condition", v)}>
            <SelectTrigger id="condition" className="h-11 w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </section>

      <Separator />

      {/* ---------------- 説明 ---------------- */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold">商品説明</h2>
        <Field
          id="description"
          label="説明"
          required
          hint="使用状況、傷の有無、付属品、購入時期など"
          counter={{ value: values.description.length, max: DESCRIPTION_MAX }}
          errors={fieldErrors.description}
        >
          <Textarea
            id="description"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={8}
          />
        </Field>
      </section>

      <Separator />

      {/* ---------------- 価格・受渡 ---------------- */}
      <section className="space-y-5">
        <h2 className="text-base font-semibold">価格・受渡</h2>

        <Field
          id="price"
          label="希望価格(税込)"
          required
          hint="300円〜9,999,999円"
          errors={fieldErrors.price}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              ¥
            </span>
            <Input
              id="price"
              type="number"
              inputMode="numeric"
              value={values.price}
              onChange={(e) => set("price", e.target.value)}
              className="h-11 pl-7 tabular-nums"
            />
          </div>
        </Field>

        {priceNumber > 0 && (
          <dl className="rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">販売手数料({Math.round(feeRate * 100)}%)</dt>
              <dd className="tabular-nums">{formatPrice(fee)}</dd>
            </div>
            <div className="mt-1.5 flex justify-between font-medium">
              <dt>受取額の目安</dt>
              <dd className="tabular-nums">{formatPrice(payout)}</dd>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              金額は目安です。売上金のお支払いは運営より個別にご案内します。
            </p>
          </dl>
        )}

        <Field id="deliveryMethod" label="受渡方法" required errors={fieldErrors.deliveryMethod}>
          <Select value={values.deliveryMethod} onValueChange={(v) => set("deliveryMethod", v)}>
            <SelectTrigger id="deliveryMethod" className="h-11 w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {DELIVERY_METHODS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="shippingFromPref"
          label="発送元の地域"
          required
          errors={fieldErrors.shippingFromPref}
        >
          <Select
            value={values.shippingFromPref}
            onValueChange={(v) => set("shippingFromPref", v)}
          >
            <SelectTrigger id="shippingFromPref" className="h-11 w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {PREFECTURES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {values.deliveryMethod === "in_person" && (
          <Field id="meetupPref" label="受渡地域" required errors={fieldErrors.meetupPref}>
            <Select value={values.meetupPref} onValueChange={(v) => set("meetupPref", v)}>
              <SelectTrigger id="meetupPref" className="h-11 w-full">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {PREFECTURES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </section>

      {/* ---------------- 送信 ---------------- */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-2xl gap-3">
          {allowDraft && (
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1"
              disabled={pending}
              onClick={() => submit("draft")}
            >
              下書き保存
            </Button>
          )}
          <Button type="submit" className="h-12 flex-1" disabled={pending}>
            {pending ? "処理中..." : "公開する"}
          </Button>
        </div>
      </div>
    </form>
  );
}
