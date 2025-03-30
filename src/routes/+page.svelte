<!-- Main page component -->
<script lang="ts">
	import { onMount } from 'svelte';
	import LocationAutocomplete from '$lib/components/LocationAutocomplete.svelte';
	import MapComponent from '$lib/components/MapComponent.svelte';
	import {
		getDirections,
		segmentRoute,
		findDestinationPOIs,
		findMapboxPOIs,
		type PlaceOfInterest
	} from '$lib/services/mapbox';
	import type { Location, DirectionsResult, RouteSegment } from '$lib/services/mapbox';

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

	// Road trip planning settings
	let targetDrivingHoursPerSegment = 5;

	// Route segments
	let routeSegments: RouteSegment[] = [];

	// POI management
	let segmentPOIs: Map<number, PlaceOfInterest[]> = new Map();
	let loadingPOIs = false;
	let showDestinationPOIs = true; // Flag to toggle destination POI display

	// Testing Mapbox POIs - set to false and never used
	let showMapboxPOIs = false;

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
			const directions = await getDirections(originLocation.center, destinationLocation.center);

			if (!directions) {
				error = 'Could not find directions between these locations';
				return;
			}

			directionsData = directions;

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

			// Generate route segments
			routeSegments = segmentRoute(directions, targetDrivingHoursPerSegment);

			// Fetch destination POIs if enabled
			if (showDestinationPOIs) {
				await fetchDestinationPOIs();
			}
		} catch (err) {
			console.error('Error fetching directions:', err);
			error = 'An error occurred while fetching directions';
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

			// Use a special segment index for destination POIs (-1)
			segmentPOIs = new Map([[-1, destinationPOIs]]);

			// Display a message if we got fallback POIs (Gemini API not configured)
			if (destinationPOIs.length === 1 && destinationPOIs[0].id.startsWith('fallback')) {
				console.warn('Using fallback POIs - Gemini API may not be configured');
			} else {
				console.log(`Found ${destinationPOIs.length} POIs from Gemini API:`, destinationPOIs);
			}
		} catch (error) {
			console.error('Error fetching destination POIs:', error);

			// Create a simple fallback POI with error information
			segmentPOIs = new Map([
				[
					-1,
					[
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
					]
				]
			]);
		} finally {
			loadingPOIs = false;
		}
	}

	// Toggle destination POI display
	function toggleDestinationPOIs() {
		showDestinationPOIs = !showDestinationPOIs;

		if (showDestinationPOIs && destinationLocation) {
			fetchDestinationPOIs();
		} else {
			segmentPOIs.clear();
			segmentPOIs = new Map(); // Trigger reactivity
		}
	}

	// Update route segments when target driving hours changes
	$: if (directionsData && targetDrivingHoursPerSegment) {
		const newSegments = segmentRoute(directionsData, targetDrivingHoursPerSegment);

		// Check if the segments have meaningfully changed by comparing the endpoint coordinates
		const oldEndpoints = routeSegments
			.map((s) => `${s.endCoordinate[0].toFixed(4)},${s.endCoordinate[1].toFixed(4)}`)
			.join('|');
		const newEndpoints = newSegments
			.map((s) => `${s.endCoordinate[0].toFixed(4)},${s.endCoordinate[1].toFixed(4)}`)
			.join('|');
		const segmentsChanged = oldEndpoints !== newEndpoints;

		// Update the segments regardless
		routeSegments = newSegments;

		// Log segment changes
		if (segmentsChanged) {
			console.log('Segments changed after slider adjustment');
			console.log('Old endpoints:', oldEndpoints);
			console.log('New endpoints:', newEndpoints);
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
				<div class="segment-settings">
					<label for="drivingHours" class="settings-label">
						Segment driving hours: {targetDrivingHoursPerSegment}
					</label>
					<input
						type="range"
						id="drivingHours"
						min="2"
						max="8"
						step="1"
						bind:value={targetDrivingHoursPerSegment}
						class="hours-slider"
					/>
					<div class="hours-range">
						<span>2h</span>
						<span>8h</span>
					</div>
				</div>
			</div>

			<div class="route-features">
				<div class="route-feature-section">
					<h3>Route Segments</h3>
					<p>
						The route is divided into segments of approximately {targetDrivingHoursPerSegment} hours
						of driving time. Green markers indicate recommended stopping points.
					</p>
				</div>

				<div class="poi-controls">
					<div class="toggle-container">
						<button class="toggle-button" on:click={toggleDestinationPOIs}>
							{showDestinationPOIs ? 'Hide' : 'Show'} Destination POIs
						</button>
					</div>
				</div>
			</div>

			{#if loadingPOIs}
				<div class="loading-message">
					<p>
						<span class="loading-spinner"></span>
						Finding interesting places along your journey...
					</p>
				</div>
			{:else if showDestinationPOIs && segmentPOIs.has(-1) && segmentPOIs.get(-1) != null}
				<div class="destination-poi-section">
					<h3>Destination Highlights (Gemini 2.0 Powered)</h3>
					<p>Discover the best attractions at your destination, recommended by Gemini 2.0 Flash:</p>

					<div class="poi-list">
						{#each segmentPOIs.get(-1) ?? [] as poi}
							<div class="poi-item gemini-recommendation">
								<div class="poi-name">{poi.name}</div>
								<div class="poi-category">{poi.category}</div>
								<div class="poi-description">{poi.description}</div>
								{#if poi.address}
									<div class="poi-address">{poi.address}</div>
								{/if}
								<div class="poi-footer">
									<span class="gemini-badge">Gemini 2.0 Pick</span>
								</div>
							</div>
						{/each}
					</div>

					<div class="api-notice">
						<p>
							<strong>Note:</strong> This feature requires a Gemini API key. Set the
							<code>VITE_GEMINI_API_KEY</code>
							environment variable to see personalized recommendations powered by Gemini 2.0 Flash.
						</p>
					</div>
				</div>
			{/if}
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

	.segment-settings {
		margin-left: auto;
		display: flex;
		flex-direction: column;
		min-width: 200px;
	}

	.settings-label {
		font-size: 0.875rem;
		color: #4b5563;
		margin-bottom: 0.5rem;
	}

	.hours-slider {
		width: 100%;
	}

	.hours-range {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #6b7280;
		margin-top: 0.25rem;
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

	.poi-controls {
		display: flex;
		gap: 1rem;
	}

	.toggle-container {
		display: flex;
		gap: 0.5rem;
	}

	.toggle-button {
		background-color: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.toggle-button:hover {
		background-color: #2563eb;
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
</style>
