<!-- MapComponent.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	import type { DirectionsResult, RouteSegment, PlaceOfInterest } from '$lib/services/mapbox';

	export let origin: [number, number] | null = null;
	export let destination: [number, number] | null = null;
	export let directionsData: DirectionsResult | null = null;
	// New props to receive location names
	export let originName: string = '';
	export let destinationName: string = '';
	// Prop for route segments
	export let routeSegments: RouteSegment[] = [];
	// Prop for points of interest
	export let segmentPOIs: Map<number, PlaceOfInterest[]> = new Map();

	// Track previous values to detect changes
	let previousOrigin: [number, number] | null = null;
	let previousDestination: [number, number] | null = null;
	let previousSegments: RouteSegment[] = [];

	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map;
	let originMarker: mapboxgl.Marker | null = null;
	let destinationMarker: mapboxgl.Marker | null = null;
	let segmentMarkers: mapboxgl.Marker[] = [];
	let poiMarkers: mapboxgl.Marker[] = [];
	let mapInitialized = false;
	let imageCache: Record<string, string> = {}; // Cache for images

	// Set mapbox token from environment variable
	mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

	// Function to fetch a location photo from Unsplash
	async function fetchLocationPhoto(locationName: string): Promise<string> {
		// Return from cache if available
		if (imageCache[locationName]) {
			return imageCache[locationName];
		}

		try {
			// Using Unsplash API through a proxy service
			// Note: For production, you should create your own Unsplash developer account
			const query = encodeURIComponent(locationName);
			const response = await fetch(
				`https://api.unsplash.com/search/photos?query=${query}&per_page=1&client_id=${import.meta.env.VITE_UNSPLASH_ACCESS_KEY || 'YOUR_UNSPLASH_ACCESS_KEY'}`
			);

			if (!response.ok) {
				throw new Error('Failed to fetch from Unsplash');
			}

			const data = await response.json();
			if (data.results && data.results.length > 0) {
				const imageUrl = data.results[0].urls.small;
				// Cache the result
				imageCache[locationName] = imageUrl;
				return imageUrl;
			}

			// Return a fallback if no image found
			return 'https://via.placeholder.com/300x200?text=No+Image+Available';
		} catch (error) {
			console.error('Error fetching image:', error);
			return 'https://via.placeholder.com/300x200?text=Image+Error';
		}
	}

	// Create a cat marker with popup
	async function createCatMarker(
		lngLat: [number, number],
		isOrigin: boolean,
		placeName: string
	): Promise<mapboxgl.Marker> {
		// Create a marker element
		const el = document.createElement('div');
		el.className = 'cat-marker';

		// Style the marker
		el.style.width = '40px';
		el.style.height = '40px';
		el.style.borderRadius = '50%';
		// Different colors for origin and destination
		el.style.background = isOrigin ? '#3b82f6' : '#ef4444';
		el.style.border = '3px solid white';
		el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

		// Add cat emoji
		el.innerHTML =
			'<span style="font-size: 24px; line-height: 40px; display: block; text-align: center;">🐱</span>';

		// Create the marker
		const marker = new mapboxgl.Marker(el).setLngLat(lngLat);

		// Only create popup if we have a place name
		if (placeName) {
			// Fetch location image from Unsplash (start fetching early)
			let imagePromise = fetchLocationPhoto(placeName);

			// Create popup element
			const popup = new mapboxgl.Popup({
				offset: 25,
				closeButton: false,
				maxWidth: '300px'
			});

			// Add hover events to show popup
			el.addEventListener('mouseenter', async () => {
				// Set basic content first
				popup.setHTML(`
					<div class="popup-content">
						<h3 style="margin-top: 0; margin-bottom: 8px; font-size: 16px;">${placeName}</h3>
						<div class="loading-indicator" style="height: 200px; display: flex; align-items: center; justify-content: center;">
							<div>Loading image...</div>
						</div>
					</div>
				`);

				// Add popup to map
				marker.setPopup(popup);
				popup.addTo(map);

				// Then update with image once loaded
				try {
					const imageUrl = await imagePromise;

					// Only update if popup is still open
					if (popup.isOpen()) {
						popup.setHTML(`
							<div class="popup-content">
								<h3 style="margin-top: 0; margin-bottom: 8px; font-size: 16px;">${placeName}</h3>
								<img src="${imageUrl}" alt="${placeName}" style="width: 100%; border-radius: 4px; object-fit: cover; height: 150px;">
								<p style="margin-top: 8px; font-size: 12px; color: #666;">Photo from Unsplash</p>
							</div>
						`);
					}
				} catch (error) {
					console.error('Error updating popup with image:', error);
				}
			});

			// Remove popup on mouse leave
			el.addEventListener('mouseleave', () => {
				setTimeout(() => popup.remove(), 300);
			});
		}

		return marker;
	}

	// Clean up all markers
	function clearMarkers() {
		if (originMarker) {
			originMarker.remove();
			originMarker = null;
		}

		if (destinationMarker) {
			destinationMarker.remove();
			destinationMarker = null;
		}

		// Clear segment markers
		segmentMarkers.forEach((marker) => marker.remove());
		segmentMarkers = [];

		// Clear POI markers
		poiMarkers.forEach((marker) => marker.remove());
		poiMarkers = [];

		// Also clear the route if it exists
		if (map && map.getSource && map.getSource('route')) {
			map.removeLayer('route-layer');
			map.removeSource('route');
		}
	}

	// Update the markers
	async function updateMarkers() {
		console.log('Updating markers:', origin, destination);

		// Check if origin changed
		const originChanged = origin !== previousOrigin;
		// Check if destination changed
		const destinationChanged = destination !== previousDestination;

		// If either location changed, clear the map
		if (originChanged || destinationChanged) {
			clearMarkers();

			// Update previous values
			previousOrigin = origin;
			previousDestination = destination;
		}

		// Update origin marker
		if (origin) {
			originMarker = await createCatMarker(origin, true, originName);
			originMarker.addTo(map);
		}

		// Update destination marker
		if (destination) {
			destinationMarker = await createCatMarker(destination, false, destinationName);
			destinationMarker.addTo(map);
		}

		// Fit bounds if both markers exist
		if (origin && destination) {
			const bounds = new mapboxgl.LngLatBounds().extend(origin).extend(destination);

			map.fitBounds(bounds, {
				padding: 100,
				maxZoom: 15
			});
		} else if (origin) {
			// If only origin exists, center on it
			map.flyTo({
				center: origin,
				zoom: 10
			});
		} else if (destination) {
			// If only destination exists, center on it
			map.flyTo({
				center: destination,
				zoom: 10
			});
		}
	}

	// Update the route
	function updateRoute() {
		if (!directionsData) return;

		// Only show route if both markers exist
		if (!origin || !destination) return;

		// Remove any existing route layers
		if (map.getSource('route')) {
			map.removeLayer('route-layer');
			map.removeSource('route');
		}

		// Add the route to the map
		map.addSource('route', {
			type: 'geojson',
			data: {
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'LineString',
					coordinates: directionsData.geometry.coordinates
				}
			}
		});

		map.addLayer({
			id: 'route-layer',
			type: 'line',
			source: 'route',
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			},
			paint: {
				'line-color': '#3b82f6',
				'line-width': 5,
				'line-opacity': 0.75
			}
		});
	}

	// Update segment markers
	async function updateSegmentMarkers() {
		// Remove old segment markers
		segmentMarkers.forEach((marker) => marker.remove());
		segmentMarkers = [];

		// We no longer display segment markers since we're using POIs as waypoints
		// The code for creating segment markers has been removed as per requirements
	}

	// Update POI markers
	function updatePOIMarkers() {
		// Remove old POI markers
		poiMarkers.forEach((marker) => marker.remove());
		poiMarkers = [];

		console.log('Updating POI markers, count:', segmentPOIs.size);

		// Skip if no segments or POIs
		if (!segmentPOIs.size) {
			console.log('No POIs to display');
			return;
		}

		// Check if we have restaurant POIs
		if (segmentPOIs.has(1000)) {
			const restaurantPOIs = segmentPOIs.get(1000) || [];
			console.log(`Displaying ${restaurantPOIs.length} restaurant POIs`);

			// Add markers for restaurant points of interest
			restaurantPOIs.forEach((poi, poiIndex) => {
				// Check if POI coordinate is valid
				if (!poi.coordinate || poi.coordinate.length !== 2) {
					console.error(`Invalid POI coordinate for restaurant POI ${poiIndex}:`, poi);
					return;
				}

				console.log(`Adding restaurant POI marker for: ${poi.name} at [${poi.coordinate}]`);

				// Create marker element
				const el = document.createElement('div');
				el.className = 'poi-marker restaurant-marker';

				// Style the marker
				el.style.width = '40px';
				el.style.height = '40px';
				el.style.borderRadius = '50%';
				el.style.background = '#10b981'; // Green for restaurants
				el.style.border = '3px solid white';
				el.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.5)';
				el.style.display = 'flex';
				el.style.alignItems = 'center';
				el.style.justifyContent = 'center';
				el.style.color = 'white';
				el.style.fontWeight = 'bold';
				el.style.fontSize = '20px';
				el.style.zIndex = '5';

				// Update restaurant icon to be consistent with other food icons
				el.textContent = '🍽️';

				// Create popup with POI info
				const popup = new mapboxgl.Popup({
					offset: 25,
					closeButton: false,
					maxWidth: '250px'
				});

				const category = poi.category
					? `<div style="color: #4b5563; font-size: 0.9em;">${poi.category}</div>`
					: '';

				const description = poi.description
					? `<p style="margin: 4px 0; font-style: italic;">${poi.description}</p>`
					: '';

				const address = poi.address
					? `<p style="margin: 4px 0; color: #64748b; font-size: 13px;">${poi.address}</p>`
					: '';

				// Immediately start fetching an image for this place
				const imagePromise = fetchLocationPhoto(poi.name);

				// Set initial popup content with loading state
				popup.setHTML(`
					<div class="popup-content">
						<h3 style="margin: 0; padding: 8px 0; font-size: 18px; text-align: center;">${poi.name}</h3>
						<div class="loading-indicator" style="height: 150px; display: flex; align-items: center; justify-content: center;">
							<div>Loading image...</div>
						</div>
					</div>
				`);

				// Add hover events to replace content with image when ready
				el.addEventListener('mouseenter', async () => {
					// Add popup to map with loading content
					popup.addTo(map);

					try {
						// Wait for image to load
						const imageUrl = await imagePromise;

						// Only update if popup is still open
						if (popup.isOpen()) {
							popup.setHTML(`
								<div class="popup-content">
									<h3 style="margin: 0; padding: 8px 0; font-size: 18px; text-align: center;">${poi.name}</h3>
									<img src="${imageUrl}" alt="${poi.name}" style="width: 100%; border-radius: 4px; object-fit: cover; height: 150px;">
								</div>
							`);
						}
					} catch (error) {
						console.error('Error updating popup with image:', error);
					}
				});

				// Remove popup on mouse leave
				el.addEventListener('mouseleave', () => {
					setTimeout(() => popup.remove(), 300);
				});

				// Create and add the marker
				const marker = new mapboxgl.Marker(el).setLngLat(poi.coordinate).setPopup(popup);
				marker.addTo(map);
				poiMarkers.push(marker);
			});
		}

		// Check if we have destination POIs
		if (segmentPOIs.has(-1)) {
			const destinationPOIs = segmentPOIs.get(-1) || [];
			console.log(`Displaying ${destinationPOIs.length} destination POIs`);

			// Add markers for destination points of interest
			destinationPOIs.forEach((poi, poiIndex) => {
				// Check if POI coordinate is valid
				if (!poi.coordinate || poi.coordinate.length !== 2) {
					console.error(`Invalid POI coordinate for destination POI ${poiIndex}:`, poi);
					return;
				}

				console.log(`Adding destination POI marker for: ${poi.name} at [${poi.coordinate}]`);

				const isPrimary = poiIndex === 0; // First POI is primary

				// Create marker element
				const el = document.createElement('div');
				el.className = 'poi-marker';

				// Style the marker
				el.style.width = isPrimary ? '40px' : '30px';
				el.style.height = isPrimary ? '40px' : '30px';
				el.style.borderRadius = '50%';
				el.style.background = isPrimary ? '#f59e0b' : '#cbd5e1'; // Amber for primary, gray for others
				el.style.border = `3px solid ${isPrimary ? '#fff' : '#94a3b8'}`;
				el.style.boxShadow = isPrimary ? '0 0 12px #f59e0b' : '0 0 8px rgba(0,0,0,0.2)';
				el.style.display = 'flex';
				el.style.alignItems = 'center';
				el.style.justifyContent = 'center';
				el.style.color = 'white';
				el.style.fontWeight = 'bold';
				el.style.fontSize = isPrimary ? '20px' : '16px';
				el.style.zIndex = isPrimary ? '5' : '3';

				// Add an icon based on category or a default
				let icon = isPrimary ? '⭐' : '📍';

				// Choose icon based on category if possible
				if (!isPrimary && poi.category) {
					const category = poi.category.toLowerCase();
					if (category.includes('museum') || category.includes('gallery')) {
						icon = '🏛️';
					} else if (category.includes('park') || category.includes('garden')) {
						icon = '🌳';
					} else if (category.includes('historic') || category.includes('monument')) {
						icon = '🗿';
					} else if (category.includes('landmark')) {
						icon = '🗼';
					} else if (category.includes('restaurant') || category.includes('cafe')) {
						icon = '🍽️';
					} else if (category.includes('museum')) {
						icon = '🏛️';
					} else if (category.includes('beach') || category.includes('coast')) {
						icon = '🏖️';
					} else if (category.includes('mountain') || category.includes('peak')) {
						icon = '⛰️';
					} else if (category.includes('entertainment') || category.includes('theater')) {
						icon = '🎭';
					} else if (category.includes('shopping') || category.includes('mall')) {
						icon = '🛍️';
					}
				}

				el.textContent = icon;

				// Create popup with POI info
				const popup = new mapboxgl.Popup({
					offset: 25,
					closeButton: false,
					maxWidth: '250px'
				});

				const primaryLabel = isPrimary
					? '<span style="color: #d97706; font-weight: bold;">Top Destination Highlight</span>'
					: '';

				const category = poi.category
					? `<div style="color: #4b5563; font-size: 0.9em;">${poi.category}</div>`
					: '';

				const description = poi.description
					? `<p style="margin: 4px 0; font-style: italic;">${poi.description}</p>`
					: '';

				// Immediately start fetching an image for this place
				const imagePromise = fetchLocationPhoto(poi.name);

				// Set initial popup content with loading state
				popup.setHTML(`
					<div class="popup-content">
						<h3 style="margin: 0; padding: 8px 0; font-size: 18px; text-align: center;">${poi.name}</h3>
						<div class="loading-indicator" style="height: 150px; display: flex; align-items: center; justify-content: center;">
							<div>Loading image...</div>
						</div>
					</div>
				`);

				// Add hover events to replace content with image when ready
				el.addEventListener('mouseenter', async () => {
					// Add popup to map with loading content
					popup.addTo(map);

					try {
						// Wait for image to load
						const imageUrl = await imagePromise;

						// Only update if popup is still open
						if (popup.isOpen()) {
							popup.setHTML(`
								<div class="popup-content">
									<h3 style="margin: 0; padding: 8px 0; font-size: 18px; text-align: center;">${poi.name}</h3>
									<img src="${imageUrl}" alt="${poi.name}" style="width: 100%; border-radius: 4px; object-fit: cover; height: 150px;">
								</div>
							`);
						}
					} catch (error) {
						console.error('Error updating popup with image:', error);
					}
				});

				// Remove popup on mouse leave
				el.addEventListener('mouseleave', () => {
					setTimeout(() => popup.remove(), 300);
				});

				// Create and add the marker
				const marker = new mapboxgl.Marker(el).setLngLat(poi.coordinate).setPopup(popup);
				marker.addTo(map);
				poiMarkers.push(marker);
			});
		} else {
			console.log('No destination POIs available');
		}

		// Check if we have route place POIs
		if (segmentPOIs.has(-2)) {
			const routePlacePOIs = segmentPOIs.get(-2) || [];
			console.log(`Displaying ${routePlacePOIs.length} route place POIs:`, routePlacePOIs);

			// Add markers for route place points of interest
			routePlacePOIs.forEach((poi, poiIndex) => {
				// Check if POI coordinate is valid
				if (!poi.coordinate || poi.coordinate.length !== 2) {
					console.error(`Invalid POI coordinate for route place POI ${poiIndex}:`, poi);
					return;
				}

				// Log a simpler message without coordinates
				console.log(`Adding route place POI marker for: ${poi.name}`);

				// Create marker element
				const el = document.createElement('div');
				el.className = 'poi-marker route-place-marker';

				// Determine the attraction type based on name/description to show appropriate icon
				let attractionType = 'general';
				let icon = '🏞️'; // Default scenic view icon

				// Extract the category from the name and description
				const nameAndDesc = (poi.name + ' ' + (poi.description || '')).toLowerCase();

				if (
					nameAndDesc.includes('national park') ||
					nameAndDesc.includes('state park') ||
					nameAndDesc.includes('forest') ||
					nameAndDesc.includes('wilderness')
				) {
					attractionType = 'park';
					icon = '🌲'; // Tree/forest
				} else if (
					nameAndDesc.includes('mountain') ||
					nameAndDesc.includes('peak') ||
					nameAndDesc.includes('hill') ||
					nameAndDesc.includes('overlook') ||
					nameAndDesc.includes('view') ||
					nameAndDesc.includes('scenic')
				) {
					attractionType = 'mountain';
					icon = '⛰️'; // Mountain
				} else if (
					nameAndDesc.includes('beach') ||
					nameAndDesc.includes('shore') ||
					nameAndDesc.includes('coast') ||
					nameAndDesc.includes('ocean') ||
					nameAndDesc.includes('bay') ||
					nameAndDesc.includes('lake')
				) {
					attractionType = 'water';
					icon = '🏖️'; // Beach
				} else if (
					nameAndDesc.includes('museum') ||
					nameAndDesc.includes('gallery') ||
					nameAndDesc.includes('art') ||
					nameAndDesc.includes('exhibit')
				) {
					attractionType = 'museum';
					icon = '🏛️'; // Museum
				} else if (
					nameAndDesc.includes('monument') ||
					nameAndDesc.includes('memorial') ||
					nameAndDesc.includes('historic') ||
					nameAndDesc.includes('landmark')
				) {
					attractionType = 'monument';
					icon = '🗿'; // Monument
				} else if (
					nameAndDesc.includes('garden') ||
					nameAndDesc.includes('botanical') ||
					nameAndDesc.includes('nature')
				) {
					attractionType = 'garden';
					icon = '🌷'; // Flower
				} else if (
					nameAndDesc.includes('bridge') ||
					nameAndDesc.includes('arch') ||
					nameAndDesc.includes('building') ||
					nameAndDesc.includes('tower')
				) {
					attractionType = 'architecture';
					icon = '🏛️'; // Classical building
				} else if (
					nameAndDesc.includes('canyon') ||
					nameAndDesc.includes('gorge') ||
					nameAndDesc.includes('rock') ||
					nameAndDesc.includes('cave') ||
					nameAndDesc.includes('cliff')
				) {
					attractionType = 'geology';
					icon = '🏔️'; // Snow-capped mountain
				} else if (
					nameAndDesc.includes('zoo') ||
					nameAndDesc.includes('wildlife') ||
					nameAndDesc.includes('aquarium')
				) {
					attractionType = 'wildlife';
					icon = '🦁'; // Lion
				} else if (
					nameAndDesc.includes('theme park') ||
					nameAndDesc.includes('amusement') ||
					nameAndDesc.includes('entertainment')
				) {
					attractionType = 'entertainment';
					icon = '🎡'; // Ferris wheel
				} else if (
					nameAndDesc.includes('weird') ||
					nameAndDesc.includes('unusual') ||
					nameAndDesc.includes('strange') ||
					nameAndDesc.includes('roadside')
				) {
					attractionType = 'quirky';
					icon = '🗿'; // Moai statue for quirky roadside attractions
				}

				// Style the marker - use blue for route stops
				el.style.width = '40px';
				el.style.height = '40px';
				el.style.borderRadius = '50%';
				el.style.background = '#3b82f6'; // Blue for route stops
				el.style.border = '3px solid white';
				el.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.5)';
				el.style.display = 'flex';
				el.style.alignItems = 'center';
				el.style.justifyContent = 'center';
				el.style.color = 'white';
				el.style.fontWeight = 'bold';
				el.style.fontSize = '20px';
				el.style.zIndex = '6'; // Higher z-index to make sure route places are visible

				// Use the categorized icon
				el.textContent = icon;

				// Create popup with POI info
				const popup = new mapboxgl.Popup({
					offset: 25,
					closeButton: false,
					maxWidth: '250px'
				});

				// Parse description - it contains both description and reasonToStop
				const descriptionParts = (poi.description || '').split('\n\n');
				const description = descriptionParts[0] || '';
				const reasonToStop = descriptionParts[1] || '';

				// Immediately start fetching an image for this place
				const imagePromise = fetchLocationPhoto(poi.name);

				// Set initial popup content with loading state
				popup.setHTML(`
					<div class="popup-content">
						<h3 style="margin: 0; padding: 8px 0; font-size: 18px; text-align: center;">${poi.name}</h3>
						<div class="loading-indicator" style="height: 150px; display: flex; align-items: center; justify-content: center;">
							<div>Loading image...</div>
						</div>
					</div>
				`);

				// Add hover events to replace content with image when ready
				el.addEventListener('mouseenter', async () => {
					// Add popup to map with loading content
					popup.addTo(map);

					try {
						// Wait for image to load
						const imageUrl = await imagePromise;

						// Only update if popup is still open
						if (popup.isOpen()) {
							popup.setHTML(`
								<div class="popup-content">
									<h3 style="margin: 0; padding: 8px 0; font-size: 18px; text-align: center;">${poi.name}</h3>
									<img src="${imageUrl}" alt="${poi.name}" style="width: 100%; border-radius: 4px; object-fit: cover; height: 150px;">
								</div>
							`);
						}
					} catch (error) {
						console.error('Error updating popup with image:', error);
					}
				});

				// Remove popup on mouse leave
				el.addEventListener('mouseleave', () => {
					setTimeout(() => popup.remove(), 300);
				});

				try {
					// Create and add the marker, using the exact coordinates from the POI
					const lngLat = poi.coordinate;
					console.log(`  Creating marker for ${poi.name}`);

					const marker = new mapboxgl.Marker(el).setLngLat(lngLat).setPopup(popup);

					marker.addTo(map);
					console.log(`  Marker added to map`);
					poiMarkers.push(marker);
				} catch (error) {
					console.error(`Error creating marker for ${poi.name}:`, error);
				}
			});
		} else {
			console.log('No route place POIs available');
		}
	}

	onMount(() => {
		if (!mapContainer) return;

		// Initialize the map
		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/streets-v11',
			center: [-98.5795, 39.8283], // Center of USA
			zoom: 3
		});

		// Add map controls
		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		// Wait for map to load
		map.on('load', () => {
			console.log('Map loaded');
			mapInitialized = true;
			// Initial update
			updateMarkers();
			if (directionsData) updateRoute();
		});
	});

	// Watch for changes to origin, destination or directions
	$: if (mapInitialized && map) {
		console.log('Properties changed:', { origin, destination });
		updateMarkers();
	}

	$: if (mapInitialized && map && directionsData) {
		updateRoute();
	}

	// Watch for changes to segment data
	$: if (mapInitialized && map && routeSegments !== previousSegments) {
		previousSegments = [...routeSegments];
		// We no longer update segment markers
		// updateSegmentMarkers(); <-- removed this call
	}

	// Watch for changes to POI data
	$: if (segmentPOIs && map) {
		console.log('segmentPOIs updated, count:', segmentPOIs.size);
		updatePOIMarkers();
	}

	onDestroy(() => {
		if (map) map.remove();
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

<style>
	.map-container {
		width: 100%;
		height: 500px;
		border-radius: 8px;
		overflow: hidden;
	}

	:global(.cat-marker) {
		cursor: pointer;
	}

	:global(.segment-marker) {
		cursor: pointer;
	}

	:global(.poi-marker) {
		cursor: pointer;
	}

	:global(.mapboxgl-popup-content) {
		padding: 15px;
		max-width: 300px;
		border-radius: 6px;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
	}
</style>
