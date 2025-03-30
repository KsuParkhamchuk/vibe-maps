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

// Interface for Mapbox POI feature
interface MapboxPOIFeature {
  id?: string;
  text?: string;
  place_name?: string;
  center: [number, number];
  place_type?: string[];
  properties?: {
    category?: string;
    description?: string;
    [key: string]: unknown;
  };
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
  destination: [number, number]
): Promise<DirectionsResult | null> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?` +
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
 * Find points of interest - disabled for route segments
 * @returns An empty array - segment POIs are not displayed
 */
export async function findPOIs(): Promise<PlaceOfInterest[]> {
  return [];
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

/**
 * Find POIs using Mapbox's API instead of Gemini
 * @param coordinate The coordinate [longitude, latitude] to search around
 * @param radiusMiles The radius in miles to search within (max 100)
 * @param category The category of places to search for
 * @param limit The maximum number of results to return
 * @returns Array of POIs found by Mapbox
 */
export async function findMapboxPOIs(
  coordinate: [number, number],
  radiusMiles: number = 100,
  category: string = "attraction",
  limit: number = 5
): Promise<PlaceOfInterest[]> {
  try {
    console.log(`Finding Mapbox POIs near [${coordinate}], radius: ${radiusMiles} miles, category: ${category}, limit: ${limit}`);
    
    // Convert miles to degrees (rough approximation: 1 degree ~ 69 miles at equator)
    // This will be used to create a bounding box
    const degreesPerMile = 1/69;
    const radiusDegrees = radiusMiles * degreesPerMile;
    
    const [lng, lat] = coordinate;
    
    // Create a bounding box for more precise location-based searching
    // Format: [min_lng, min_lat, max_lng, max_lat]
    const bbox = [
      lng - radiusDegrees,
      lat - radiusDegrees,
      lng + radiusDegrees,
      lat + radiusDegrees
    ].join(',');
    
    // Build URL for Mapbox Geocoding API with category search
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${category}.json?` +
      `proximity=${lng},${lat}` +
      `&bbox=${bbox}` + // Add bounding box for more precise results
      `&limit=${limit}` + // Get specified number of results
      `&country=us` + // Limit to US
      `&access_token=${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}`;
    
    console.log("Mapbox API URL:", url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("Mapbox API response:", data);
    
    // Transform Mapbox results to our POI format
    if (data && data.features && data.features.length > 0) {
      return data.features.map((feature: MapboxPOIFeature, index: number) => {
        // Extract and format place details
        const name = feature.text || `Place ${index + 1}`;
        const address = feature.place_name?.split(', ').slice(1).join(', ') || '';
        
        // Calculate distance (approximation)
        const featureLng = feature.center[0];
        const featureLat = feature.center[1];
        const distance = calculateDistance(coordinate, [featureLng, featureLat]);
        
        // Get category from properties or use default
        let poiCategory = category; // Use the requested category as default
        if (feature.properties && feature.properties.category) {
          poiCategory = feature.properties.category;
        } else if (feature.place_type && feature.place_type.length > 0) {
          poiCategory = feature.place_type[0];
        }
        
        return {
          id: feature.id || `mapbox-poi-${index}`,
          name: name,
          category: poiCategory,
          coordinate: feature.center as [number, number],
          distance: distance,
          address: address,
          description: feature.properties?.description || `A ${poiCategory} near your route.`,
          importance: index === 0 ? 1 : 0.5
        };
      });
    }
    
    console.log("No POIs found using Mapbox API");
    return [];
    
  } catch (error) {
    console.error("Error finding POIs with Mapbox:", error);
    return [];
  }
}

/**
 * Find segment points of interest using Mapbox API
 * @param segments Array of route segments
 * @param originName Name of the origin location
 * @param destinationName Name of the destination location
 * @returns Map of segment index to array of places of interest
 */
export async function findSegmentPOIs(
  segments: RouteSegment[],
  originName: string,
  destinationName: string
): Promise<Map<number, PlaceOfInterest[]>> {
  const segmentPOIs = new Map<number, PlaceOfInterest[]>();
  
  // Skip if no segments
  if (!segments || segments.length === 0) {
    console.log('No segments to find POIs for');
    return segmentPOIs;
  }
  
  console.log(`Finding POIs for ${segments.length} segments from ${originName} to ${destinationName}`);
  
  // Process segments sequentially to avoid overwhelming the API
  for (let i = 0; i < segments.length; i++) {
    // Skip the last segment (destination POIs are handled separately)
    if (i === segments.length - 1) continue;
    
    // We need the next segment to know the endpoint
    if (i + 1 >= segments.length) continue;
    
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    
    // Define the segment area
    const startCoord = segment.startCoordinate;
    const endCoord = nextSegment.startCoordinate; // Next segment's start is current segment's end
    
    // Define the segment description
    let segmentDescription;
    if (i === 0) {
      segmentDescription = `from ${originName} to the first stop`;
    } else {
      segmentDescription = `between stop ${i} and stop ${i + 1}`;
    }
    
    try {
      console.log(`Finding POIs for segment ${i} ${segmentDescription}`);
      
      // Calculate midpoint for proximity search
      const midLng = (startCoord[0] + endCoord[0]) / 2;
      const midLat = (startCoord[1] + endCoord[1]) / 2;
      
      // Use Mapbox API to find attractions near the midpoint
      const pois = await findMapboxPOIs([midLng, midLat], 100, 'attraction');
      
      // Store the list for this segment
      if (pois.length > 0) {
        segmentPOIs.set(i, pois.slice(0, 1)); // Just take the first result
      } else {
        // If no results, create a simulated one
        segmentPOIs.set(i, [{
          id: `segment-poi-${i}`,
          name: `Segment ${i} Highlight`,
          category: 'point of interest',
          coordinate: [
            startCoord[0] + (endCoord[0] - startCoord[0]) * 0.5,
            startCoord[1] + (endCoord[1] - startCoord[1]) * 0.5
          ],
          distance: 0,
          address: `Along segment ${i}`,
          description: `A simulated point of interest along segment ${i} of your journey.`,
          importance: 1
        }]);
      }
    } catch (error) {
      console.error(`Error in findSegmentPOIs for segment ${i}:`, error);
      // Add simulated POI for this segment
      segmentPOIs.set(i, [{
        id: `segment-poi-${i}`,
        name: `Segment ${i} Highlight`,
        category: 'point of interest',
        coordinate: [
          startCoord[0] + (endCoord[0] - startCoord[0]) * 0.5,
          startCoord[1] + (endCoord[1] - startCoord[1]) * 0.5
        ],
        distance: 0,
        address: `Along segment ${i}`,
        description: `A simulated point of interest along segment ${i} of your journey.`,
        importance: 1
      }]);
    }
    
    // Small pause to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return segmentPOIs;
}

