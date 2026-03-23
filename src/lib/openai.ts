import OpenAI from "openai";

export const isOpenAIConfigured = !!process.env.OPENAI_API_KEY;

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "placeholder",
});
