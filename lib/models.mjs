// Model IDs and effort support verified against OpenRouter's /api/v1/models catalog.
// Keep this shared: UI defaults and server validation must agree.
export const MODELS = [
  { id: "google/gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", outputPrice: 2.5, efforts: ["low", "medium", "high"] },
  { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash", outputPrice: 0.25, efforts: ["low", "high"] },
  { id: "deepseek/deepseek-v4-flash-0731", name: "DeepSeek V4 Flash", outputPrice: 0.18, efforts: ["low", "high"] },
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", outputPrice: 1.2, efforts: ["low", "medium", "high"] },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", outputPrice: 3.75, efforts: ["low", "medium", "high"] },
];

export const DEFAULT_MODEL = MODELS[0].id;
export const DEFAULT_EFFORT = "low";

export function getGenerationOptions(model = DEFAULT_MODEL, effort = DEFAULT_EFFORT) {
  const selected = MODELS.find((entry) => entry.id === model);
  if (!selected) throw new Error("Select a supported model in settings.");
  if (!selected.efforts.includes(effort)) throw new Error("Unsupported reasoning effort for this model.");
  return {
    model,
    reasoning: { effort, exclude: true },
    // This budget includes reasoning AND the final JSON, unlike the old 500-token cap.
    max_tokens: { low: 4096, medium: 6144, high: 8192 }[effort],
    // Enforce the price ceiling at routing time, including provider price differences.
    provider: { max_price: { completion: 5 } },
    response_format: { type: "json_object" },
  };
}
