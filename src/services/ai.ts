import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateInitialDraft(prompt: string, files: File[] = []): Promise<string> {
  const parts: any[] = [{ text: prompt }];

  for (const file of files) {
    const base64 = await fileToBase64(file);
    parts.push({
      inlineData: {
        data: base64.split(',')[1],
        mimeType: file.type,
      },
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts },
    config: {
      systemInstruction: "You are an expert ghostwriter and editor. Write a high-quality draft based on the user's prompt. Output only the text, no markdown formatting like ```markdown.",
    }
  });

  return response.text || "";
}

export async function iterateText(text: string, instruction: string, context: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Context of the document: "${context}"\n\nOriginal text: "${text}"\n\nInstruction: ${instruction}\n\nRewrite the original text based on the instruction. Output ONLY the rewritten text, nothing else.`,
  });
  return response.text || "";
}

export interface ProactiveSuggestion {
  improvedText: string;
  feedback: string;
  imagePrompt?: string;
  imageReasoning?: string;
}

export async function getProactiveSuggestion(text: string, contextBefore: string, contextAfter: string): Promise<ProactiveSuggestion | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert editor. Review the target text within its surrounding context.

Context Before:
"""
${contextBefore}
"""

Context After:
"""
${contextAfter}
"""

Target Text to Review:
"""
${text}
"""

If the Target Text can be significantly improved (better flow, clarity, impact, or fixing grammatical errors), provide the improved version and a brief explanation of why you made the change. 
Use Markdown formatting for the feedback to make it readable (e.g., bolding key changes, using bullet points if necessary).
If it's already good and doesn't need changes, return an empty string for improvedText.

Additionally, evaluate if the text contains data, statistics, comparisons, processes, or complex concepts that would benefit from a visual representation (like an infographic or chart).
If so, provide a detailed image generation prompt (specifying a clean, modern 'nano-banana' style infographic or chart. CRITICAL: The image MUST be stylized to seamlessly blend into a dark mode UI, featuring a transparent background, white text and lines, and high-contrast accent colors) and a brief explanation of why it would help.

Output JSON in the following format:
{
  "improvedText": "the rewritten text, or empty string if no changes needed",
  "feedback": "markdown formatted explanation of the improvement",
  "imagePrompt": "detailed prompt for image generation, or empty string if not needed",
  "imageReasoning": "why an infographic/chart helps here, or empty string"
}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            improvedText: { type: Type.STRING },
            feedback: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            imageReasoning: { type: Type.STRING }
          },
          required: ["improvedText", "feedback"]
        }
      }
    });

    let result;
    try {
      result = JSON.parse(response.text?.trim() || "{}");
    } catch (e) {
      console.error("Failed to parse JSON response", e);
      return null;
    }

    const hasTextImprovement = result.improvedText && result.improvedText.trim() !== "" && result.improvedText !== text;
    const hasImageSuggestion = result.imagePrompt && result.imagePrompt.trim() !== "";

    if (hasTextImprovement || hasImageSuggestion) {
      return {
        improvedText: hasTextImprovement ? result.improvedText.trim() : text,
        feedback: result.feedback || (hasImageSuggestion ? "Suggested adding a visual aid." : "Improved clarity and flow."),
        imagePrompt: hasImageSuggestion ? result.imagePrompt.trim() : undefined,
        imageReasoning: result.imageReasoning?.trim()
      };
    }
    return null;
  } catch (e) {
    console.error("Proactive suggestion failed", e);
    return null;
  }
}

export async function determineImagePrompt(hint: string, context: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are an expert art director and illustrator.
Context of the document where the image will be inserted:
"""
${context}
"""

User's hint or request (if any):
"""
${hint}
"""

Based on the context and the user's hint, determine the perfect image to generate. 
Write a highly detailed, descriptive image generation prompt that captures the core concept, mood, and style appropriate for this document.
Output ONLY the image generation prompt, nothing else.`,
  });
  return response.text?.trim() || hint || "A beautiful abstract illustration";
}

export async function generateImage(prompt: string, aspectRatio: string = "16:9"): Promise<string | null> {
  try {
    const enhancedPrompt = `${prompt}\n\nCRITICAL STYLING INSTRUCTION: The image MUST be designed for a dark mode user interface. It MUST have a transparent background, with all text, lines, and primary elements in white or bright high-contrast colors. Do not use a solid background color.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: enhancedPrompt }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e) {
    console.error("Image generation failed", e);
    return null;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
