// Gemini API service
import type { PlaceOfInterest } from './mapbox';

/**
 * Interface for Gemini API configuration
 */
interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Gemini API configuration
 */
export const geminiConfig: GeminiConfig = {
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-2.0-flash'
};

/**
 * Interface for the response from Gemini API
 */
interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
    };
  }[];
}

/**
 * Interface for POI recommendation from Gemini API
 */
interface GeminiPOIRecommendation {
  name: string;
  category: string;
  description: string;
  coordinate?: [number, number];
  address?: string;
}

/**
 * Interface for a place recommended by Gemini along a route
 */
interface GeminiRecommendedPlace {
  name: string;
  description: string;
  reasonToStop: string;
  coordinate?: [number, number];
}

/**
 * Interface for route places recommendation from Gemini
 */
interface GeminiRoutePlacesRecommendation {
  recommendedPlaces: GeminiRecommendedPlace[];
}

/**
 * Validates if the Gemini API key is available
 */
function validateApiConfig(): boolean {
  if (!geminiConfig.apiKey) {
    console.error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your environment.');
    return false;
  }
  return true;
}

/**
 * Generates a prompt for the Gemini API to get POI recommendations
 */
function generatePOIPrompt(placeName: string, coordinates: [number, number]): string {
  return `I need recommendations for exactly 2-3 must-visit attractions in ${placeName} (coordinates: [${coordinates[1]}, ${coordinates[0]}]).

These should be the most popular, highly-rated, and culturally significant attractions that tourists would typically want to visit. 

For each recommendation, provide the following information in valid JSON format:
- name: Full and accurate name of the place
- category: Specific type of attraction (e.g., Museum, Historic Site, Park, Landmark, etc.)
- description: A 1-2 sentence description highlighting what makes it special and why visitors should go there
- coordinate: Precise [longitude, latitude] coordinates as numbers (not strings)
- address: Physical street address if available

IMPORTANT: 
1. Format your response ONLY as a clean JSON array with each object containing these fields.
2. Provide geographically accurate coordinates - don't guess if you're unsure.
3. Make sure the places are actual attractions in the exact city/location specified.
4. DO NOT include any explanatory text outside the JSON array.

Example format:
[
  {
    "name": "Golden Gate Bridge",
    "category": "Landmark",
    "description": "Iconic suspension bridge spanning the Golden Gate Strait. Known for its striking orange color and Art Deco design, it offers spectacular views of the bay and city skyline.",
    "coordinate": [-122.4786, 37.8199],
    "address": "Golden Gate Bridge, San Francisco, CA 94129"
  }
]`;
}

/**
 * Generates a prompt for the Gemini API to get recommended places along a route
 */
function generatePlacesRecommendationPrompt(
  originName: string, 
  destinationName: string, 
  distance: number, 
  duration: number
): string {
  return `I'm planning a road trip from ${originName} to ${destinationName}. The total distance is ${(distance / 1609.34).toFixed(1)} miles and would take approximately ${(duration / 3600).toFixed(1)} hours of continuous driving.

Based on this information, recommend 2-4 diverse and interesting stopping places along this route. Focus on unique attractions, natural wonders, landmarks, and hidden gems rather than just cities. Consider:
1. A reasonable daily driving time (around 5-8 hours per day)
2. Diverse types of attractions (national parks, natural wonders, unique landmarks, historical sites, roadside attractions)
3. Places that are directly on or very close to the route (not requiring long detours)
4. Places that showcase the unique character and natural features of the regions you're driving through

IMPORTANT: Prioritize unique attractions and natural wonders over generic cities/towns. Examples might include: scenic overlooks, national/state parks, unusual roadside attractions, famous landmarks, historical sites, natural wonders, etc.

For each place, provide:
1. Specific name of the attraction or landmark (not just a city name)
2. Brief, evocative description of what makes it special and worth visiting
3. Why it's a good stopping point on this journey
4. Coordinates as precisely as possible [longitude, latitude]

Please respond ONLY with a valid JSON object in the following format:
{
  "recommendedPlaces": [
    {
      "name": "Specific Attraction/Landmark Name",
      "description": "Brief, engaging description highlighting what makes this place special",
      "reasonToStop": "Why this is a perfect stop on this journey",
      "coordinate": [longitude, latitude]
    },
    // More place objects as needed
  ]
}

Do not include any text outside of this JSON object.`;
}

/**
 * Parses a JSON string from Gemini response
 */
function extractJsonFromResponse(text: string): GeminiPOIRecommendation[] {
  try {
    // Find the JSON array in the response (sometimes Gemini adds explanatory text)
    const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no array match, try parsing the whole response
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse JSON from Gemini response:', error);
    throw new Error('Invalid response format from Gemini API');
  }
}

/**
 * Parses a JSON object from Gemini response
 */
function extractJsonObjectFromResponse(text: string): GeminiRoutePlacesRecommendation {
  try {
    // Find the JSON object in the response (sometimes Gemini adds explanatory text)
    const jsonMatch = text.match(/\{\s*".*"\s*:\s*.*\}/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no object match, try parsing the whole response
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse JSON from Gemini response:', error);
    throw new Error('Invalid response format from Gemini API');
  }
}

/**
 * Makes a request to the Gemini API to get POI recommendations
 */
export async function getGeminiPOIRecommendations(
  placeName: string,
  coordinates: [number, number]
): Promise<PlaceOfInterest[]> {
  // Check if API key is configured
  if (!validateApiConfig()) {
    throw new Error('Gemini API is not properly configured');
  }

  const prompt = generatePOIPrompt(placeName, coordinates);
  
  // Updated URL format for gemini-2.0-flash
  const url = `${geminiConfig.baseUrl}/models/${geminiConfig.model}:generateContent?key=${geminiConfig.apiKey}`;

  try {
    console.log(`Requesting Gemini recommendations using ${geminiConfig.model} for ${placeName}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          topK: 40,
          topP: 0.95
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data: GeminiResponse = await response.json();
    
    // Extract and parse the recommendations from the response
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts.length > 0) {
      const responseText = data.candidates[0].content.parts[0].text;
      console.log('Gemini raw response:', responseText);
      
      const recommendations = extractJsonFromResponse(responseText);
      
      // Convert the recommendations to our PlaceOfInterest format
      return recommendations.map((rec: GeminiPOIRecommendation, index: number) => ({
        id: `gemini-poi-${index}-${Date.now()}`,
        name: rec.name,
        category: rec.category,
        description: rec.description,
        coordinate: rec.coordinate || coordinates, // Use provided coordinate or fallback to city center
        distance: 0, // We don't have distance for destination POIs
        address: rec.address || '',
        importance: index === 0 ? 3 : 2 // First POI has highest importance
      }));
    }
    
    throw new Error('No recommendations received from Gemini API');
  } catch (error) {
    console.error('Error fetching POI recommendations from Gemini:', error);
    throw error;
  }
}

/**
 * Makes a request to the Gemini API to get recommended places along a route
 */
export async function getGeminiRoutePlacesRecommendations(
  originName: string,
  destinationName: string,
  distance: number,
  duration: number
): Promise<GeminiRoutePlacesRecommendation> {
  // Check if API key is configured
  if (!validateApiConfig()) {
    throw new Error('Gemini API is not properly configured');
  }

  const prompt = generatePlacesRecommendationPrompt(originName, destinationName, distance, duration);
  
  // URL format for gemini-2.0-flash
  const url = `${geminiConfig.baseUrl}/models/${geminiConfig.model}:generateContent?key=${geminiConfig.apiKey}`;

  try {
    console.log(`Requesting Gemini route places recommendation for ${originName} to ${destinationName}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          topK: 40,
          topP: 0.95
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data: GeminiResponse = await response.json();
    
    // Extract and parse the recommendation from the response
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts.length > 0) {
      const responseText = data.candidates[0].content.parts[0].text;
      console.log('Gemini places recommendation response:', responseText);
      
      return extractJsonObjectFromResponse(responseText) as GeminiRoutePlacesRecommendation;
    }
    
    throw new Error('No places recommendation received from Gemini API');
  } catch (error) {
    console.error('Error fetching route places recommendation from Gemini:', error);
    throw error;
  }
} 