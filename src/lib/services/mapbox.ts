// Mapbox API service
import { gql } from 'graphql-tag';

// Interface for location data
export interface Location {
  id: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
}

// Interface for directions data
export interface DirectionsResult {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: {
    coordinates: [number, number][]; // Array of [longitude, latitude] pairs
  };
}

// Interface for route segment
export interface RouteSegment {
  startIndex: number;
  endIndex: number;
  startCoordinate: [number, number];
  endCoordinate: [number, number];
  distance: number; // in meters
  duration: number; // in seconds
  coordinates: [number, number][];
}

// Interface for Place of Interest - kept for type compatibility
export interface PlaceOfInterest {
  id: string;
  name: string;
  category: string;
  coordinate: [number, number];
  distance: number; // in meters from segment endpoint
  address?: string;
  importance?: number; 
  description?: string;
}

// GraphQL query for geocoding (autocomplete)
export const SEARCH_LOCATIONS = gql`
  query SearchLocations($query: String!, $country: String) {
    searchLocations(query: $query, country: $country) {
      id
      place_name
      center
    }
  }
`;

// Interface for Mapbox feature response
interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

// Function to get autocomplete suggestions
export async function searchLocations(query: string): Promise<Location[]> {
  // Since Mapbox might not have a GraphQL endpoint, we'll implement a REST fallback
  // This would be replaced with proper GraphQL implementation if available
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
      `access_token=${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}` +
      `&country=us&autocomplete=true&types=place,address`
    );
    
    const data = await response.json();
    
    return data.features.map((feature: MapboxFeature) => ({
      id: feature.id,
      place_name: feature.place_name,
      center: feature.center
    }));
  } catch (error) {
    console.error('Error searching locations:', error);
    return [];
  }
}

// Function to get directions between two points
export async function getDirections(
  origin: [number, number],
  destination: [number, number],
  waypoints?: [number, number][]
): Promise<DirectionsResult | null> {
  try {
    // Build the coordinates string based on whether waypoints are provided
    let coordinatesString = `${origin[0]},${origin[1]}`;
    
    // Add waypoints if provided
    if (waypoints && waypoints.length > 0) {
      // Mapbox only supports up to 25 waypoints, so limit if needed
      const limitedWaypoints = waypoints.slice(0, 23); // 25 total minus origin and destination
      
      for (const waypoint of limitedWaypoints) {
        coordinatesString += `;${waypoint[0]},${waypoint[1]}`;
      }
    }
    
    // Add destination
    coordinatesString += `;${destination[0]},${destination[1]}`;
    
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesString}?` +
      `access_token=${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}` +
      `&geometries=geojson&overview=full`
    );
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      return {
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
        geometry: data.routes[0].geometry
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting directions:', error);
    return null;
  }
}

// Function to segment a route based on driving time (in hours)
export function segmentRoute(
  directionsData: DirectionsResult,
  targetDrivingHoursPerSegment: number = 5
): RouteSegment[] {
  if (!directionsData || !directionsData.geometry || !directionsData.geometry.coordinates) {
    return [];
  }

  const coordinates = directionsData.geometry.coordinates;
  const totalDurationHours = directionsData.duration / 3600; // Convert seconds to hours
  const totalDistance = directionsData.distance;
  
  // If the total trip is shorter than the target segment size, return the whole route as one segment
  if (totalDurationHours <= targetDrivingHoursPerSegment) {
    return [{
      startIndex: 0,
      endIndex: coordinates.length - 1,
      startCoordinate: coordinates[0],
      endCoordinate: coordinates[coordinates.length - 1],
      distance: totalDistance,
      duration: directionsData.duration,
      coordinates: coordinates
    }];
  }
  
  const segments: RouteSegment[] = [];
  const targetDurationSeconds = targetDrivingHoursPerSegment * 3600; // Convert hours to seconds
  
  // Calculate approximate distance/time ratio for the entire route
  const distanceTimeRatio = totalDistance / directionsData.duration;
  
  let currentSegmentStart = 0;
  let accumulatedDuration = 0;
  let accumulatedDistance = 0;
  
  // Create segments of approximately the target duration
  for (let i = 1; i < coordinates.length; i++) {
    // Estimate duration between this coordinate and the previous one
    // This is a simplification - in reality the time would depend on road types, speed limits, etc.
    const segmentDistance = calculateDistance(coordinates[i-1], coordinates[i]);
    const estimatedDuration = segmentDistance / distanceTimeRatio;
    
    accumulatedDuration += estimatedDuration;
    accumulatedDistance += segmentDistance;
    
    // If we've reached approximately our target segment duration, create a segment
    if (accumulatedDuration >= targetDurationSeconds || i === coordinates.length - 1) {
      segments.push({
        startIndex: currentSegmentStart,
        endIndex: i,
        startCoordinate: coordinates[currentSegmentStart],
        endCoordinate: coordinates[i],
        distance: accumulatedDistance,
        duration: accumulatedDuration,
        coordinates: coordinates.slice(currentSegmentStart, i + 1)
      });
      
      // Reset for next segment
      currentSegmentStart = i;
      accumulatedDuration = 0;
      accumulatedDistance = 0;
    }
  }
  
  return segments;
}

// Helper function to calculate distance between two coordinates using the Haversine formula
function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in meters
}

/**
 * Find destination points of interest using Gemini API
 * @param coordinate The destination coordinates as [longitude, latitude]
 * @param placeName The name of the destination location
 * @returns Array of 2-3 places of interest at the destination
 */
export async function findDestinationPOIs(
  coordinate: [number, number], 
  placeName: string
): Promise<PlaceOfInterest[]> {
  console.log(`Finding destination POIs for ${placeName} at [${coordinate}]`);
  
  try {
    // Import the Gemini API service dynamically to avoid circular dependencies
    const { getGeminiPOIRecommendations } = await import('./gemini');
    
    // Use the actual Gemini API to get recommendations
    return await getGeminiPOIRecommendations(placeName, coordinate);
  } catch (error) {
    console.error('Error getting recommendations from Gemini API:', error);
    
    // Fallback to basic POIs if Gemini API fails or is not configured
    console.log('Falling back to basic POI information');
    return [
      {
        id: `fallback-poi-1-${Date.now()}`,
        name: 'Points of Interest',
        category: 'Information',
        description: `Set up Gemini API to get real attraction recommendations for ${placeName}.`,
        coordinate: [coordinate[0], coordinate[1]],
        distance: 0,
        importance: 1
      }
    ];
  }
}