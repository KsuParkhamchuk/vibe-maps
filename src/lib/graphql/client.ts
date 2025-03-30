import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { browser } from '$app/environment';

// Create the Apollo Client instance
export const client = new ApolloClient({
  link: new HttpLink({
    uri: 'https://api.mapbox.com/graphql', // This is a placeholder, Mapbox may not have a GraphQL endpoint
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}`
    }
  }),
  cache: new InMemoryCache(),
  ssrMode: !browser
}); 