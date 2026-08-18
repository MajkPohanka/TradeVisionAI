import { z } from 'zod';

// Helper for formatting Zod validation errors cleanly
export function formatZodError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (!firstIssue) return 'Neplatná vstupní data.';
  const field = firstIssue.path.join('.');
  return field ? `Neplatná hodnota pro pole '${field}': ${firstIssue.message}` : firstIssue.message;
}

// Schema for /api/analyze-chart
export const AnalyzeChartSchema = z.object({
  licenseKey: z
    .string({ message: 'Licenční klíč je povinný.' })
    .min(5, 'Licenční klíč je příliš krátký.')
    .max(50, 'Licenční klíč je příliš dlouhý.')
    .trim(),
  images: z
    .array(z.string().min(10, 'Neplatný formát obrázku.'), {
      message: 'Je vyžadován alespoň 1 obrázek grafu.',
    })
    .min(1, 'Nahrajte alespoň 1 obrázek grafu.')
    .max(4, 'Můžete nahrát maximálně 4 časové rámce grafu najednou.'),
  settings: z
    .object({
      language: z.enum(['cs', 'en', 'es', 'de', 'sk']).optional(),
      tradingStyle: z.string().max(60).optional(),
      riskRewardRatio: z.string().max(30).optional(),
      confidenceThreshold: z.number().min(0).max(100).optional(),
      accountType: z.string().max(50).optional(),
      accountSizeUsd: z.number().nonnegative().optional(),
      customRules: z
        .union([
          z.string().max(5000),
          z.array(z.string().max(500)).max(50),
        ])
        .optional(),
      methodologyPreferences: z
        .object({
          smc: z.boolean().optional(),
          ict: z.boolean().optional(),
          wyckoff: z.boolean().optional(),
          priceAction: z.boolean().optional(),
          volumeProfile: z.boolean().optional(),
        })
        .optional(),
    })
    .passthrough()
    .optional(),
});

// Schema for /api/audit-metatrader
export const AuditMetaTraderSchema = z
  .object({
    licenseKey: z
      .string({ message: 'Licenční klíč je povinný.' })
      .min(5, 'Licenční klíč je příliš krátký.')
      .max(50, 'Licenční klíč je příliš dlouhý.')
      .trim(),
    rawText: z.string().max(10000000, 'Textový výpis je příliš velký (max 10 MB).').optional(),
    images: z.array(z.string().min(10)).max(4, 'Můžete nahrát max 4 screenshoty.').optional(),
    settings: z
      .object({
        language: z.enum(['cs', 'en', 'es', 'de', 'sk']).optional(),
      })
      .passthrough()
      .optional(),
  })
  .refine(
    (data) => (data.rawText && data.rawText.trim().length > 0) || (data.images && data.images.length > 0),
    {
      message: 'Pro analýzu MetaTrader výpisu vložte buď textový výpis/CSV nebo obrázek historie.',
      path: ['rawText'],
    }
  );

// Schema for /api/ask-mentor
export const AskMentorSchema = z.object({
  licenseKey: z
    .string({ message: 'Licenční klíč je povinný.' })
    .min(5, 'Licenční klíč je příliš krátký.')
    .max(50, 'Licenční klíč je příliš dlouhý.')
    .trim(),
  question: z
    .string({ message: 'Dotaz je povinný.' })
    .min(1, 'Dotaz nesmí být prázdný.')
    .max(2500, 'Dotaz je příliš dlouhý (max 2500 znaků).')
    .trim(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'model', 'system']).optional(),
        sender: z.enum(['user', 'mentor', 'assistant', 'system']).optional(),
        text: z.string().max(5000).optional(),
        content: z.string().max(5000).optional(),
      })
    )
    .max(30, 'Historie konverzace překročila maximální délku.')
    .optional(),
  currentAnalysis: z.any().optional(),
  settings: z
    .object({
      language: z.enum(['cs', 'en', 'es', 'de', 'sk']).optional(),
    })
    .passthrough()
    .optional(),
});

// Schema for /api/credits/claim-trial
export const ClaimTrialSchema = z.object({
  email: z.string().email('Zadejte platnou e-mailovou adresu.').max(120).optional().or(z.literal('')),
});

// Schema for /api/credits/create-checkout-session
export const CreateCheckoutSessionSchema = z.object({
  packageId: z.enum(['starter', 'pro', 'institutional']),
  existingKey: z.string().max(50).optional(),
  customerEmail: z.string().email('Zadejte platný e-mail.').max(120).optional().or(z.literal('')),
  appUrl: z.string().url('Neplatná URL aplikace.').max(300).optional(),
});

// Schema for /api/credits/confirm-session
export const ConfirmSessionSchema = z.object({
  sessionId: z
    .string({ message: 'Chybí ID platební relace.' })
    .min(5, 'ID relace je příliš krátké.')
    .max(200, 'ID relace je příliš dlouhé.')
    .trim(),
});
