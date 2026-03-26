// =============================================================================
// LLM CLIENTS — Multi-Model Pipeline
// All three use the same OpenAI SDK format (baseURL swap). No new library needed.
// =============================================================================

import OpenAI from "openai";

// --- Qwen3 via DashScope (Alibaba) ---
// Role: Symptom extraction + natural question phrasing
export const isQwenConfigured = !!process.env.QWEN_API_KEY;
export const qwen = new OpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.QWEN_API_KEY || "placeholder",
});

// --- DeepSeek R1 via SiliconFlow ---
// Role: Deep differential diagnosis reasoning
export const isDeepSeekConfigured = !!process.env.SILICONFLOW_API_KEY;
export const deepseek = new OpenAI({
  baseURL: "https://api.siliconflow.cn/v1",
  apiKey: process.env.SILICONFLOW_API_KEY || "placeholder",
});

// --- GLM-5 via BigModel ---
// Role: Safety verification layer (1.2% hallucination rate)
export const isGLMConfigured = !!process.env.GLM_API_KEY;
export const glm = new OpenAI({
  baseURL: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: process.env.GLM_API_KEY || "placeholder",
});

// --- OpenAI (embeddings only) ---
// Role: Generate embeddings for RAG search (Pinecone)
export const isOpenAIConfigured = !!process.env.OPENAI_API_KEY;
export const openaiEmbeddings = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "placeholder",
});

// --- Helper: Check if multi-LLM pipeline is available ---
export function isMultiLLMConfigured(): boolean {
  return isQwenConfigured && isDeepSeekConfigured && isGLMConfigured;
}
