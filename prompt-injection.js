// A narrow, deterministic backstop for obvious role spoofing and instruction
// overrides. This is not a general-purpose prompt-injection detector: the
// multilingual classifier and independent output checks are still required.
const obviousOverrides = [
  /<\|(?:im_start|im_end|system|developer|assistant|endoftext)\|>/iu,
  /(?:^|\n)\s*(?:\[\s*(?:system|developer)\s*\]|<\/?(?:system|developer)>)\s*/iu,
  /\b(?:ignore|disregard|forget|override|bypass|disable|deactivate|circumvent)\b[\s\S]{0,80}\b(?:instructions?|prompts?|rules?|polic(?:y|ies)|guardrails?|moderation|filters?|safety|safeguards?)\b/iu,
  /\b(?:reveal|print|expose|leak|show|repeat)\b[\s\S]{0,80}\b(?:system|developer|hidden|private|internal)\b[\s\S]{0,60}\b(?:instructions?|prompts?|messages?|rules?|polic(?:y|ies)|secrets?)\b/iu,
  /(?:نادیده|فراموش|بی\s*اثر|دور\s*بزن|غیرفعال|لغو)[\s\S]{0,80}(?:دستور|قوانین|فیلتر|ایمنی|امنیت|محدودیت|پرامپت)/u,
  /(?:دستور|قوانین|فیلتر|ایمنی|امنیت|محدودیت|پرامپت)[\s\S]{0,80}(?:نادیده|فراموش|بی\s*اثر|دور\s*بزن|غیرفعال|لغو)/u
];
export function hasObviousPromptInjection(value) {
  if (typeof value !== 'string') throw new TypeError('Expected text');
  // Normalize only for detection; never modify the original transcript.
  const text=value.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g,'');
  return obviousOverrides.some(pattern=>pattern.test(text));
}
