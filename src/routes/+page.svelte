<!-- Main page component -->
<script lang="ts">
	import { onMount } from 'svelte';
	import LocationAutocomplete from '$lib/components/LocationAutocomplete.svelte';
	import MapComponent from '$lib/components/MapComponent.svelte';
	import { getDirections, findDestinationPOIs, type PlaceOfInterest } from '$lib/services/mapbox';
	import type { Location, DirectionsResult, RouteSegment } from '$lib/services/mapbox';
	import { getGeminiRoutePlacesRecommendations } from '$lib/services/gemini';

	// Location state
	let originLocation: Location | null = null;
	let destinationLocation: Location | null = null;
	let originInput = '';
	let destinationInput = '';

	// Directions state
	let directionsData: DirectionsResult | null = null;
	let loading = false;
	let error: string | null = null;

	// Formatted route details
	let distance = '';
	let duration = '';

	// Route segments are only kept for type compatibility
	let routeSegments: RouteSegment[] = [];

	// POI management
	let segmentPOIs: Map<number, PlaceOfInterest[]> = new Map();
	let loadingPOIs = false;
	let routeId = ''; // Unique identifier for the current route to force map refresh

	// Loading message for POIs
	let poiLoadingMessage = 'Finding interesting places along your journey...';

	// Category preferences
	let categoryPreferences = {
		nationalParks: true,
		landmarks: true,
		scenicViews: true,
		food: false,
		cities: false,
		quirky: false
	};

	// Function to get the active category count
	function getActiveCategoryCount() {
		return Object.values(categoryPreferences).filter(Boolean).length;
	}

	// Update loading message based on category preferences
	$: {
		const count = getActiveCategoryCount();
		if (count === 0) {
			poiLoadingMessage = 'Finding interesting places along your journey...';
		} else if (count === 1) {
			// Get the name of the active category
			const activeCategory = Object.entries(categoryPreferences).find(
				([_, isActive]) => isActive
			)?.[0];

			let categoryName = '';
			switch (activeCategory) {
				case 'nationalParks':
					categoryName = 'national parks';
					break;
				case 'landmarks':
					categoryName = 'landmarks';
					break;
				case 'scenicViews':
					categoryName = 'scenic views';
					break;
				case 'food':
					categoryName = 'food stops';
					break;
				case 'cities':
					categoryName = 'cities';
					break;
				case 'quirky':
					categoryName = 'quirky attractions';
					break;
				default:
					categoryName = 'places';
			}

			poiLoadingMessage = `Finding ${categoryName} along your journey...`;
		} else if (count === Object.keys(categoryPreferences).length) {
			poiLoadingMessage = 'Finding all types of interesting places along your journey...';
		} else {
			poiLoadingMessage = `Finding your selected categories of places along your journey...`;
		}
	}

	onMount(() => {
		// Load Mapbox CSS
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
		document.head.appendChild(link);
	});

	async function handleSubmit() {
		if (!originLocation || !destinationLocation) {
			error = 'Please select both origin and destination locations';
			return;
		}

		error = null;
		loading = true;
		segmentPOIs.clear();

		try {
			// Step 1: Get route POIs from Gemini
			loadingPOIs = true;
			let routePOIs: PlaceOfInterest[] = [];

			try {
				console.log('Getting route POI recommendations from Gemini...');
				const placesRecommendation = await getGeminiRoutePlacesRecommendations(
					originLocation.place_name,
					destinationLocation.place_name,
					0, // We don't have distance yet
					0, // We don't have duration yet
					categoryPreferences // Pass the category preferences
				);

				if (placesRecommendation && placesRecommendation.recommendedPlaces) {
					// Convert to POIs
					routePOIs = placesRecommendation.recommendedPlaces.map((place, index) => ({
						id: `route-place-${index}-${Date.now()}`,
						name: place.name,
						category: place.category || 'Route Stop',
						description: `${place.description}\n\n${place.reasonToStop}`,
						coordinate: place.coordinate || [0, 0],
						distance: 0,
						importance: 3
					}));

					// Filter out any with invalid coordinates
					routePOIs = routePOIs.filter(
						(poi) =>
							poi.coordinate &&
							poi.coordinate.length === 2 &&
							poi.coordinate[0] !== 0 &&
							poi.coordinate[1] !== 0
					);

					console.log(`Found ${routePOIs.length} valid route POIs:`, routePOIs);
				}
			} catch (geminiError) {
				console.error('Error getting route POIs from Gemini:', geminiError);
			}

			// Step 2: Get directions with waypoints if we have any
			const waypoints = routePOIs.length > 0 ? routePOIs.map((poi) => poi.coordinate) : undefined;

			const directions = await getDirections(
				originLocation.center,
				destinationLocation.center,
				waypoints
			);

			if (!directions) {
				error = 'Could not find directions between these locations';
				loadingPOIs = false;
				return;
			}

			directionsData = directions;
			routeId = `route-${Date.now()}`; // Generate new route ID on each route calculation

			// Clear any previous error messages
			error = null;

			// Format distance (convert from meters to miles)
			const miles = (directions.distance / 1609.34).toFixed(1);
			distance = `${miles} miles`;

			// Format duration (convert from seconds to hours and minutes)
			const hours = Math.floor(directions.duration / 3600);
			const minutes = Math.floor((directions.duration % 3600) / 60);

			if (hours > 0) {
				duration = `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
			} else {
				duration = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
			}

			// No need to generate segments, we now have waypoints
			routeSegments = [];

			// Add the route POIs to the display
			if (routePOIs.length > 0) {
				console.log(`Adding ${routePOIs.length} POI waypoints to the display`);

				// Add these POIs to our map (-2 index for route places)
				const updatedPOIs = new Map([...segmentPOIs]);
				updatedPOIs.set(-2, routePOIs);
				segmentPOIs = updatedPOIs;
			}

			// Fetch destination POIs as well
			await fetchDestinationPOIs();
			loadingPOIs = false;
		} catch (err) {
			console.error('Error fetching directions:', err);
			// Handle unknown error type properly
			if (err instanceof Error) {
				error = `An error occurred while fetching directions: ${err.message}`;
			} else {
				error = 'An error occurred while fetching directions';
			}
			loadingPOIs = false;
		} finally {
			loading = false;
		}
	}

	// Fetch points of interest only for the destination
	async function fetchDestinationPOIs() {
		if (!destinationLocation) return;

		loadingPOIs = true;
		try {
			console.log('Fetching destination POIs via Gemini API...');
			const destinationPOIs = await findDestinationPOIs(
				destinationLocation.center,
				destinationLocation.place_name
			);

			// Create a new Map that preserves existing POIs (especially route place POIs at index -2)
			const updatedPOIs = new Map([...segmentPOIs]);

			// Add destination POIs with index -1
			updatedPOIs.set(-1, destinationPOIs);

			// Update the map with both destination and any existing route POIs
			segmentPOIs = updatedPOIs;
			console.log('Updated POIs with destinations, preserved route places:', segmentPOIs);

			// Display a message if we got fallback POIs (Gemini API not configured)
			if (destinationPOIs.length === 1 && destinationPOIs[0].id.startsWith('fallback')) {
				console.warn('Using fallback POIs - Gemini API may not be configured');
			} else {
				console.log(`Found ${destinationPOIs.length} POIs from Gemini API:`, destinationPOIs);
			}
		} catch (error) {
			console.error('Error fetching destination POIs:', error);

			// Create a simple fallback POI with error information
			// Preserve existing POIs but add error POI for destination
			const updatedPOIs = new Map([...segmentPOIs]);
			updatedPOIs.set(-1, [
				{
					id: `error-poi-${Date.now()}`,
					name: 'API Configuration Required',
					category: 'Error',
					description:
						'Could not retrieve destination recommendations. Please check the console for details.',
					coordinate: destinationLocation.center,
					distance: 0,
					importance: 1
				}
			]);
			segmentPOIs = updatedPOIs;
		} finally {
			loadingPOIs = false;
		}
	}

	function handleOriginSelect(event: CustomEvent<{ location: Location }>) {
		originLocation = event.detail.location;
	}

	function handleDestinationSelect(event: CustomEvent<{ location: Location }>) {
		destinationLocation = event.detail.location;
	}
</script>

<svelte:head>
	<title>Vibe Maps - Find Your Way</title>
</svelte:head>

<main class="container">
	<header>
		<h1>Vibe Maps</h1>
		<p>Find your way across the USA with our cat-guided directions</p>
	</header>

	<div class="directions-container">
		<form on:submit|preventDefault={handleSubmit}>
			<div class="form-row">
				<div class="form-field">
					<LocationAutocomplete
						label="From"
						placeholder="Enter starting location"
						bind:value={originInput}
						on:select={handleOriginSelect}
					/>
				</div>

				<div class="form-field">
					<LocationAutocomplete
						label="To"
						placeholder="Enter destination"
						bind:value={destinationInput}
						on:select={handleDestinationSelect}
					/>
				</div>

				<div class="button-container">
					<button type="submit" class="submit-button" disabled={loading}>
						{#if loading}
							Finding Route...
						{:else}
							Get Directions
						{/if}
					</button>
				</div>
			</div>

			{#if error}
				<div class="error-message">
					{error}
				</div>
			{/if}

			<div class="category-preferences">
				<h3>What would you like to see along your route?</h3>
				<div class="checkbox-group">
					<label class="checkbox-label" class:active={categoryPreferences.nationalParks}>
						<input type="checkbox" bind:checked={categoryPreferences.nationalParks} />
						<span class="checkbox-icon">🌲</span>
						National Parks
					</label>
					<label class="checkbox-label" class:active={categoryPreferences.landmarks}>
						<input type="checkbox" bind:checked={categoryPreferences.landmarks} />
						<span class="checkbox-icon">🗿</span>
						Landmarks
					</label>
					<label class="checkbox-label" class:active={categoryPreferences.scenicViews}>
						<input type="checkbox" bind:checked={categoryPreferences.scenicViews} />
						<span class="checkbox-icon">🏔️</span>
						Scenic Views
					</label>
					<label class="checkbox-label" class:active={categoryPreferences.food}>
						<input type="checkbox" bind:checked={categoryPreferences.food} />
						<span class="checkbox-icon">🍽️</span>
						Food
					</label>
					<label class="checkbox-label" class:active={categoryPreferences.cities}>
						<input type="checkbox" bind:checked={categoryPreferences.cities} />
						<span class="checkbox-icon">🏙️</span>
						Cities
					</label>
					<label class="checkbox-label" class:active={categoryPreferences.quirky}>
						<input type="checkbox" bind:checked={categoryPreferences.quirky} />
						<span class="checkbox-icon">🎪</span>
						Quirky Attractions
					</label>
				</div>
			</div>
		</form>

		<div class="map-wrapper">
			<MapComponent
				origin={originLocation?.center || null}
				destination={destinationLocation?.center || null}
				{directionsData}
				originName={originLocation?.place_name || ''}
				destinationName={destinationLocation?.place_name || ''}
				{routeSegments}
				segmentPOIs={new Map([...segmentPOIs].filter(([key]) => key !== 1000))}
			/>
		</div>

		{#if distance && duration}
			<div class="route-info">
				<div class="info-item">
					<span class="info-label">Distance:</span>
					<span class="info-value">{distance}</span>
				</div>
				<div class="info-item">
					<span class="info-label">Duration:</span>
					<span class="info-value">{duration}</span>
				</div>
			</div>
		{/if}

		{#if loadingPOIs}
			<div class="loading-message">
				<p>
					<span class="loading-spinner"></span>
					{poiLoadingMessage}
				</p>
			</div>
		{/if}
	</div>
</main>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2.5rem;
		color: #1f2937;
		margin-bottom: 0.5rem;
	}

	header p {
		color: #6b7280;
		font-size: 1.1rem;
	}

	.directions-container {
		background-color: white;
		border-radius: 0.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	form {
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.form-row {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.form-field {
		flex: 1;
		min-width: 200px;
	}

	.button-container {
		display: flex;
		align-items: flex-end;
		padding-bottom: 0.5rem;
	}

	/* Add responsive styles */
	@media (max-width: 768px) {
		.form-field {
			flex-basis: 100%;
			margin-bottom: 1rem;
		}

		.button-container {
			width: 100%;
			padding-bottom: 0;
		}

		.submit-button {
			width: 100%;
		}
	}

	.submit-button {
		background-color: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
		height: 48px; /* Match the height of the input fields */
		white-space: nowrap;
	}

	.submit-button:hover {
		background-color: #2563eb;
	}

	.submit-button:disabled {
		background-color: #93c5fd;
		cursor: not-allowed;
	}

	.error-message {
		margin-top: 1rem;
		padding: 0.75rem;
		background-color: #fee2e2;
		color: #b91c1c;
		border-radius: 0.375rem;
	}

	.map-wrapper {
		padding: 1rem;
	}

	.route-info {
		display: flex;
		padding: 1rem 1.5rem;
		border-top: 1px solid #e5e7eb;
		background-color: #f9fafb;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.info-item {
		display: flex;
		gap: 0.5rem;
	}

	.info-label {
		font-weight: 600;
		color: #4b5563;
	}

	.info-value {
		color: #111827;
	}

	.route-features {
		display: flex;
		gap: 2rem;
	}

	.route-feature-section {
		flex: 1;
	}

	.route-feature-section h3 {
		margin-top: 0;
		margin-bottom: 0.5rem;
		color: #1f2937;
		font-size: 1.1rem;
	}

	.route-feature-section p {
		margin: 0.5rem 0;
		color: #4b5563;
		font-size: 0.9rem;
	}

	.loading-message {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background-color: #f9fafb;
		border-radius: 0.375rem;
		text-align: center;
	}

	.loading-spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(59, 130, 246, 0.3);
		border-radius: 50%;
		border-top-color: #3b82f6;
		animation: spin 1s ease-in-out infinite;
		margin-right: 8px;
		vertical-align: middle;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.destination-poi-section {
		padding: 1rem 1.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.route-places-section {
		padding: 1rem 1.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.poi-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.poi-item {
		padding: 1rem;
		background-color: #f9fafb;
		border-radius: 0.375rem;
		border-left: 4px solid #f59e0b;
	}

	.route-place {
		border-left: 4px solid #3b82f6; /* Blue for route stops */
		position: relative;
	}

	.route-badge {
		font-size: 0.7rem;
		background-color: #3b82f6;
		color: white;
		padding: 0.2rem 0.5rem;
		border-radius: 1rem;
		display: inline-block;
	}

	.poi-name {
		font-weight: 600;
		color: #1f2937;
		margin-bottom: 0.25rem;
	}

	.poi-category {
		color: #4b5563;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.poi-description {
		color: #6b7280;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.restaurant-item {
		border-left: 4px solid #10b981; /* Green for restaurants */
	}

	.gemini-recommendation {
		border-left: 4px solid #8b5cf6; /* Purple for Gemini recommendations */
		position: relative;
	}

	.poi-footer {
		margin-top: 0.75rem;
		display: flex;
		justify-content: flex-end;
	}

	.gemini-badge {
		font-size: 0.7rem;
		background-color: #8b5cf6;
		color: white;
		padding: 0.2rem 0.5rem;
		border-radius: 1rem;
		display: inline-block;
	}

	.poi-address {
		color: #6b7280;
		font-size: 0.75rem;
		margin-top: 0.5rem;
		font-style: italic;
	}

	.poi-coordinates {
		color: #4b5563;
		font-size: 0.75rem;
		margin-top: 0.5rem;
		font-family: monospace;
		background: #f3f4f6;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		display: inline-block;
	}

	.api-notice {
		margin-top: 1rem;
		padding: 0.75rem;
		background-color: #f0f9ff;
		border: 1px solid #bae6fd;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		color: #0369a1;
	}

	.api-notice code {
		background-color: #e0f2fe;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		font-family: monospace;
	}

	.success-message {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background-color: #dcfce7;
		color: #166534;
		border-radius: 0.375rem;
		font-weight: 500;
		animation:
			fadeIn 0.3s ease-out,
			fadeOut 0.5s ease-in 4.5s forwards;
		position: absolute;
		right: 1rem;
		z-index: 10;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeOut {
		from {
			opacity: 1;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(-10px);
		}
	}

	.building-route-message {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background-color: #f0f9ff;
		color: #0369a1;
		border-radius: 0.375rem;
		font-weight: 500;
		position: absolute;
		right: 1rem;
		z-index: 10;
		animation: fadeIn 0.3s ease-out;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	/* Category preference styles */
	.category-preferences {
		margin-top: 1.5rem;
		padding: 0 1rem;
	}

	.category-preferences h3 {
		font-size: 1rem;
		color: #4b5563;
		margin-bottom: 1rem;
		font-weight: 500;
	}

	.checkbox-group {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		font-size: 0.9rem;
		color: #374151;
		cursor: pointer;
		padding: 0.5rem 1rem;
		background-color: #f9fafb;
		border-radius: 0.5rem;
		border: 1px solid #e5e7eb;
		transition: all 0.2s;
	}

	.checkbox-label:hover {
		background-color: #f3f4f6;
		border-color: #d1d5db;
	}

	.checkbox-label.active {
		background-color: #dbeafe;
		border-color: #93c5fd;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.checkbox-label input[type='checkbox'] {
		margin-right: 8px;
		accent-color: #3b82f6;
	}

	.checkbox-label input[type='checkbox']:checked + .checkbox-icon {
		transform: scale(1.3);
	}

	.checkbox-icon {
		margin-right: 8px;
		font-size: 1.2rem;
		display: inline-block;
		transition: transform 0.2s;
	}

	@media (max-width: 768px) {
		.checkbox-group {
			gap: 0.5rem;
		}

		.checkbox-label {
			padding: 0.4rem 0.7rem;
			font-size: 0.85rem;
		}
	}
</style>
