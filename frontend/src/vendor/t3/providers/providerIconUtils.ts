/*
 * Copied/adapted from T3 Code apps/web/src/components/chat/providerIconUtils.ts
 * (MIT License). clawctrl keeps the model-display helpers local so the
 * composer picker can share T3's provider-instance language without pulling
 * in T3's full icon system.
 */

export type ModelEsque = {
  slug: string
  name: string
  shortName?: string | undefined
  subProvider?: string | undefined
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  if (options?.preferShortName && model.shortName) {
    return model.shortName
  }
  return model.name
}

export function getTriggerDisplayModelName(model: ModelEsque): string {
  return getDisplayModelName(model, { preferShortName: true })
}

export function getTriggerDisplayModelLabel(model: ModelEsque): string {
  const title = getTriggerDisplayModelName(model)
  return model.subProvider ? `${model.subProvider} · ${title}` : title
}
