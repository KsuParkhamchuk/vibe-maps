import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Interface for POI response structure
type GeminiResponse = { 
  name: string;
  category: string;
  description: string;
  coordinate: [number, number];
  address?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Get prompt from the request body
    const { prompt } = await request.json();
    
    if (!prompt) {
      return json({ error: 'No prompt provided' }, { status: 400 });
    }
    
    console.log('Sending request to Gemini API with prompt:', prompt);
    
    // Here, we would normally make an actual call to the Gemini API
    // Since we don't have actual API credentials in this demo, we'll simulate a response
    // In a real implementation, you would use the Google AI SDK to call Gemini
    
    // Simulate the Gemini API response based on the prompt
    const simulatedResponse = generateSimulatedResponse(prompt);
    
    return json(simulatedResponse);
    
  } catch (error) {
    console.error('Error processing Gemini request:', error);
    return json(
      { error: 'Failed to process request' }, 
      { status: 500 }
    );
  }
};

// Function to simulate a Gemini response for destinations
function generateSimulatedResponse(prompt: string): GeminiResponse[] {
  // Extract place name from the prompt using regex
  // Example: "Find 2-3 interesting places to visit in or near San Francisco"
  let placeName = "the destination";
  const placeMatch = prompt.match(/near\s+([^(]+)(\s*\(coordinates|$)/i);
  
  if (placeMatch && placeMatch[1]) {
    placeName = placeMatch[1].trim();
  }
  
  // Extract coordinates from the prompt using regex
  // Example: "coordinates: 37.7749, -122.4194"
  let latitude = 0;
  let longitude = 0;
  
  const coordMatch = prompt.match(/coordinates:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/i);
  if (coordMatch) {
    latitude = parseFloat(coordMatch[1]);
    longitude = parseFloat(coordMatch[2]);
  }
  
  console.log(`Generating simulated POIs for ${placeName} at [${latitude}, ${longitude}]`);
  
  // Generate city-specific POIs if possible, or generic ones if not
  return getDestinationPOIs(placeName, latitude, longitude);
}

// Generate destination-specific POIs
function getDestinationPOIs(placeName: string, latitude: number, longitude: number): GeminiResponse[] {
  // Return generic POIs based on the place name and coordinates
  const categories = ['museum', 'landmark', 'park', 'historical site', 'cultural center'];
  const response: GeminiResponse[] = [];
  
  // Generate 2-3 POIs
  const poiCount = Math.random() > 0.5 ? 3 : 2;
  
  for (let i = 0; i < poiCount; i++) {
    // Slightly offset the coordinates for each POI
    const latOffset = (Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1);
    const lngOffset = (Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1);
    
    const category = categories[Math.floor(Math.random() * categories.length)];
    const poiName = `${placeName} ${generatePlacePrefix()} ${category.charAt(0).toUpperCase() + category.slice(1)}`;
    
    response.push({
      name: poiName,
      category,
      description: `A fascinating ${category} with unique features and cultural significance in ${placeName}.`,
      coordinate: [longitude + lngOffset, latitude + latOffset],
      address: `Near city center, ${placeName}`
    });
  }
  
  return response;
}

// Generate a prefix for the POI name
function generatePlacePrefix(): string {
  const prefixes = [
    'Main', 'Central', 'Historic', 'Famous', 'Grand', 'National', 'City', 
    'Public', 'Regional', 'Downtown', 'Metropolitan'
  ];
  
  return prefixes[Math.floor(Math.random() * prefixes.length)];
} 