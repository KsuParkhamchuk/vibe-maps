<!-- LocationAutocomplete.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { searchLocations } from '$lib/services/mapbox';
	import type { Location } from '$lib/services/mapbox';

	export let label: string;
	export let placeholder: string = 'Enter a location';
	export let value: string = '';

	let inputElement: HTMLInputElement;
	let suggestions: Location[] = [];
	let loading = false;
	let focused = false;
	let selectedIndex = -1;

	const dispatch = createEventDispatcher<{
		select: { location: Location };
	}>();

	async function handleInput() {
		if (value.trim().length < 2) {
			suggestions = [];
			return;
		}

		loading = true;
		try {
			suggestions = await searchLocations(value);
			selectedIndex = -1;
		} catch (error) {
			console.error('Error fetching suggestions:', error);
		} finally {
			loading = false;
		}
	}

	function handleSelect(location: Location) {
		value = location.place_name;
		suggestions = [];
		dispatch('select', { location });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!suggestions.length) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				if (selectedIndex >= 0) {
					event.preventDefault();
					handleSelect(suggestions[selectedIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				suggestions = [];
				inputElement.blur();
				break;
		}
	}

	function handleBlur() {
		// Small delay to allow clicks on suggestions to register
		setTimeout(() => {
			focused = false;
		}, 150);
	}

	let debounceTimer: ReturnType<typeof setTimeout>;

	function debouncedInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(handleInput, 300);
	}

	$: if (value !== undefined) {
		debouncedInput();
	}
</script>

<div class="location-autocomplete">
	<label for={label.toLowerCase().replace(/\s+/g, '-')}>
		{label}
	</label>

	<div class="input-container">
		<input
			id={label.toLowerCase().replace(/\s+/g, '-')}
			type="text"
			{placeholder}
			bind:value
			bind:this={inputElement}
			on:focus={() => (focused = true)}
			on:blur={handleBlur}
			on:keydown={handleKeydown}
		/>

		{#if loading}
			<div class="spinner"></div>
		{/if}
	</div>

	{#if suggestions.length > 0 && focused}
		<ul class="suggestions">
			{#each suggestions as suggestion, i}
				<li
					class={i === selectedIndex ? 'selected' : ''}
					on:mousedown={() => handleSelect(suggestion)}
					on:mouseover={() => (selectedIndex = i)}
				>
					{suggestion.place_name}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.location-autocomplete {
		position: relative;
		margin-bottom: 0;
		width: 100%;
	}

	label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.input-container {
		position: relative;
		height: 48px;
	}

	input {
		width: 100%;
		height: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 1rem;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
	}

	.suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 10;
		margin-top: 0.25rem;
		max-height: 16rem;
		overflow-y: auto;
		background-color: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		padding: 0;
		list-style: none;
	}

	.suggestions li {
		padding: 0.75rem 1rem;
		cursor: pointer;
	}

	.suggestions li:hover,
	.suggestions li.selected {
		background-color: #f3f4f6;
	}

	.spinner {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid rgba(156, 163, 175, 0.3);
		border-radius: 50%;
		border-top-color: #3b82f6;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: translateY(-50%) rotate(0deg);
		}
		to {
			transform: translateY(-50%) rotate(360deg);
		}
	}
</style>
