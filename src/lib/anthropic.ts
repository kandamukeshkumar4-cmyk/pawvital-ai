import Anthropic from "@anthropic-ai/sdk";

export const isAnthropicConfigured = !!process.env.ANTHROPIC_API_KEY;

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "placeholder",
});
