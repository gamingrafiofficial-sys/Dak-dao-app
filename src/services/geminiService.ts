import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function transcribeVoice(base64Audio: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: "Transcribe this audio request for a service (like electrician, plumber, etc.) in Bengali or English. Just return the transcription." },
          { inlineData: { mimeType: "audio/wav", data: base64Audio } }
        ]
      }
    ]
  });
  return response.text || "";
}

export async function analyzeProblem(description: string): Promise<{ category: string; estimatedCost: number }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this service request description: "${description}". 
    Categorize it into one of: Electrician, Plumber, Tutor, Delivery, Cleaner, Other. 
    Also provide an estimated cost in BDT (Bangladeshi Taka). 
    Return as JSON: { "category": "...", "estimatedCost": 0 }`,
    config: {
      responseMimeType: "application/json"
    }
  });
  
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { category: "Other", estimatedCost: 500 };
  }
}
